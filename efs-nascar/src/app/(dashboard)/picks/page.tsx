'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Race, Driver, Pick, Team } from '@/types';
import { BASE_DRIVER_USES } from '@/types';
import { LocalTime } from '@/components/LocalTime';

export default function PicksPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [userTeam, setUserTeam] = useState<Team | null>(null);
  const [races, setRaces] = useState<Race[]>([]);
  const [selectedRace, setSelectedRace] = useState<Race | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driverUsages, setDriverUsages] = useState<Record<string, number>>({});
  const [bonusUses, setBonusUses] = useState(1);
  const [existingPick, setExistingPick] = useState<Pick | null>(null);

  const [selectedDrivers, setSelectedDrivers] = useState<(string | null)[]>([null, null, null]);
  const [searchTerm, setSearchTerm] = useState('');
  const [fantasyRaceNumbers, setFantasyRaceNumbers] = useState<Record<string, number>>({});

  // Load initial data
  useEffect(() => {
    async function loadData() {
      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push('/login');
          return;
        }

        // Get user's team
        const { data: membership } = await supabase
          .from('team_memberships')
          .select('*, team:teams(*)')
          .eq('user_id', user.id)
          .single();

        if (!membership?.team) {
          setError('You are not assigned to a team.');
          setLoading(false);
          return;
        }

        setUserTeam(membership.team as Team);

        // Get active season
        const { data: season } = await supabase
          .from('seasons')
          .select('*')
          .eq('is_active', true)
          .single();

        if (!season) {
          setError('No active season.');
          setLoading(false);
          return;
        }

        // Get only the next upcoming race (not all future races)
        // Users can only submit picks for the immediate next race
        const { data: upcomingRaces } = await supabase
          .from('races')
          .select('*')
          .eq('season_id', season.id)
          .eq('status', 'upcoming')
          .gt('deadline_datetime', new Date().toISOString())
          .order('scheduled_datetime', { ascending: true })
          .limit(1);

        setRaces(upcomingRaces || []);

        // Get all races for the season to calculate fantasy race numbers
        const { data: allSeasonRaces } = await supabase
          .from('races')
          .select('id')
          .eq('season_id', season.id)
          .order('race_number', { ascending: true });

        // Create a map of race IDs to their fantasy league position (1-based index)
        const fantasyNumbers: Record<string, number> = {};
        allSeasonRaces?.forEach((race, index) => {
          fantasyNumbers[race.id] = index + 1;
        });
        setFantasyRaceNumbers(fantasyNumbers);

        // Get all active drivers
        const { data: allDrivers } = await supabase
          .from('drivers')
          .select('*')
          .eq('is_active', true)
          .order('car_number', { ascending: true });

        setDrivers(allDrivers || []);

        // Calculate driver usages from submitted picks for this team
        const { data: allPicks } = await supabase
          .from('picks')
          .select('driver_1_id, driver_2_id, driver_3_id, race:races!inner(season_id)')
          .eq('team_id', membership.team.id)
          .eq('races.season_id', season.id);

        const usageMap: Record<string, number> = {};
        allPicks?.forEach((pick: any) => {
          [pick.driver_1_id, pick.driver_2_id, pick.driver_3_id].forEach((driverId) => {
            usageMap[driverId] = (usageMap[driverId] || 0) + 1;
          });
        });
        setDriverUsages(usageMap);

        // Get bonus usages
        const { data: bonus } = await supabase
          .from('team_season_bonuses')
          .select('*')
          .eq('team_id', membership.team.id)
          .eq('season_id', season.id)
          .single();

        setBonusUses(bonus?.bonus_usages ?? 1);

        // Select race from URL param or first upcoming
        const raceIdParam = searchParams.get('race');
        const targetRace = upcomingRaces?.find((r) => r.id === raceIdParam) || upcomingRaces?.[0];

        if (targetRace) {
          setSelectedRace(targetRace);
          await loadExistingPick(membership.team.id, targetRace.id);
        }

        setLoading(false);
      } catch (err) {
        console.error('Error loading data:', err);
        setError('Failed to load data.');
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const loadExistingPick = async (teamId: string, raceId: string) => {
    const { data: pick } = await supabase
      .from('picks')
      .select('*')
      .eq('team_id', teamId)
      .eq('race_id', raceId)
      .single();

    if (pick) {
      setExistingPick(pick as Pick);
      setSelectedDrivers([pick.driver_1_id, pick.driver_2_id, pick.driver_3_id]);
    } else {
      setExistingPick(null);
      setSelectedDrivers([null, null, null]);
    }
  };

  const handleRaceChange = async (raceId: string) => {
    const race = races.find((r) => r.id === raceId);
    if (race && userTeam) {
      setSelectedRace(race);
      setSelectedDrivers([null, null, null]);
      setExistingPick(null);
      await loadExistingPick(userTeam.id, raceId);
    }
  };

  const handleDriverSelect = (slot: number, driverId: string | null) => {
    const newSelection = [...selectedDrivers];
    newSelection[slot] = driverId;
    setSelectedDrivers(newSelection);
    setError(null);
    setSuccess(false);
  };

  const getDriverUsage = (driverId: string) => {
    return driverUsages[driverId] || 0;
  };

  const getMaxUses = (driverId: string) => {
    const currentUses = getDriverUsage(driverId);
    // Can use the 5th use on limited drivers based on bonus
    return currentUses >= BASE_DRIVER_USES ? BASE_DRIVER_USES + bonusUses : BASE_DRIVER_USES;
  };

  const isDriverAvailable = (driverId: string) => {
    const usage = getDriverUsage(driverId);
    const maxUses = getMaxUses(driverId);
    return usage < maxUses;
  };

  const isDriverSelected = (driverId: string) => {
    return selectedDrivers.includes(driverId);
  };

  const handleSubmit = async () => {
    if (!selectedRace || !userTeam) return;

    const hasAllDrivers = selectedDrivers.every((d) => d !== null);
    const hasNoDrivers = selectedDrivers.every((d) => d === null);

    // If no drivers selected and existing pick, delete it
    if (hasNoDrivers && existingPick) {
      setSubmitting(true);
      setError(null);

      try {
        const { error: deleteError } = await supabase
          .from('picks')
          .delete()
          .eq('id', existingPick.id);

        if (deleteError) throw deleteError;

        setSuccess(true);
        setExistingPick(null);

        // Recalculate driver usages after deletion
        const { data: { user } } = await supabase.auth.getUser();
        const { data: membership } = await supabase
          .from('team_memberships')
          .select('team_id')
          .eq('user_id', user?.id)
          .single();
        const { data: season } = await supabase
          .from('seasons')
          .select('id')
          .eq('is_active', true)
          .single();
        if (membership && season) {
          const { data: allPicks } = await supabase
            .from('picks')
            .select('driver_1_id, driver_2_id, driver_3_id, race:races!inner(season_id)')
            .eq('team_id', membership.team_id)
            .eq('races.season_id', season.id);
          const usageMap: Record<string, number> = {};
          allPicks?.forEach((pick: any) => {
            [pick.driver_1_id, pick.driver_2_id, pick.driver_3_id].forEach((driverId) => {
              usageMap[driverId] = (usageMap[driverId] || 0) + 1;
            });
          });
          setDriverUsages(usageMap);
        }
      } catch (err: any) {
        console.error('Error deleting pick:', err);
        setError(err.message || 'Failed to delete picks.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Validate all slots filled for new/update
    if (!hasAllDrivers) {
      setError('Please select 3 drivers.');
      return;
    }

    // Validate no duplicates
    const uniqueDrivers = new Set(selectedDrivers);
    if (uniqueDrivers.size !== 3) {
      setError('Please select 3 different drivers.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const pickData = {
        team_id: userTeam.id,
        race_id: selectedRace.id,
        driver_1_id: selectedDrivers[0]!,
        driver_2_id: selectedDrivers[1]!,
        driver_3_id: selectedDrivers[2]!,
      };

      if (existingPick) {
        // Update existing pick
        const { error: updateError } = await supabase
          .from('picks')
          .update({
            ...pickData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingPick.id);

        if (updateError) throw updateError;
      } else {
        // Insert new pick
        const { error: insertError } = await supabase
          .from('picks')
          .insert(pickData);

        if (insertError) throw insertError;
      }

      setSuccess(true);
      setExistingPick({ ...pickData, id: existingPick?.id || '', submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() });

      // Recalculate driver usages after submission
      const { data: { user } } = await supabase.auth.getUser();
      const { data: membership } = await supabase
        .from('team_memberships')
        .select('team_id')
        .eq('user_id', user?.id)
        .single();
      const { data: season } = await supabase
        .from('seasons')
        .select('id')
        .eq('is_active', true)
        .single();
      if (membership && season) {
        const { data: allPicks } = await supabase
          .from('picks')
          .select('driver_1_id, driver_2_id, driver_3_id, race:races!inner(season_id)')
          .eq('team_id', membership.team_id)
          .eq('races.season_id', season.id);
        const usageMap: Record<string, number> = {};
        allPicks?.forEach((pick: any) => {
          [pick.driver_1_id, pick.driver_2_id, pick.driver_3_id].forEach((driverId) => {
            usageMap[driverId] = (usageMap[driverId] || 0) + 1;
          });
        });
        setDriverUsages(usageMap);
      }
    } catch (err: any) {
      console.error('Error submitting pick:', err);
      setError(err.message || 'Failed to submit picks.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredDrivers = drivers.filter((driver) =>
    driver.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    driver.car_number.toString().includes(searchTerm) ||
    driver.team_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-purple-400">Loading...</div>
      </div>
    );
  }

  if (!userTeam) {
    return (
      <div className="bg-amber-500/10 border border-amber-500/50 text-amber-400 px-4 py-3 rounded-lg">
        <p className="font-medium">You&apos;re not assigned to a team.</p>
        <p className="text-sm mt-1 text-amber-400/80">Contact a commissioner to be added to a team.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header - hidden on mobile */}
      <div className="hidden sm:block">
        <h1 className="text-3xl font-bold text-white">Submit Picks</h1>
        <p className="text-purple-400 mt-1">Select 3 drivers for the upcoming race</p>
      </div>

      {/* Race Info */}
      <div className="glass rounded-xl p-6">
        {races.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-purple-300 text-lg">No upcoming races available for picks</p>
            <p className="text-purple-500 text-sm mt-2">
              Check back after the current race results are finalized.
            </p>
          </div>
        ) : selectedRace ? (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-amber-400 font-bold text-lg">Race {fantasyRaceNumbers[selectedRace.id] || selectedRace.race_number}</span>
              <span className="text-white text-xl font-semibold">{selectedRace.name}</span>
            </div>
            <p className="text-purple-300 mb-2">{selectedRace.track}</p>
            <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
              <div>
                <span className="text-purple-500">Deadline:</span>{' '}
                <span className="text-purple-200"><LocalTime dateStr={selectedRace.deadline_datetime} format="datetime" /></span>
              </div>
              <div>
                <span className="text-purple-500">Race Time:</span>{' '}
                <span className="text-purple-200"><LocalTime dateStr={selectedRace.scheduled_datetime} format="datetime" /></span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {selectedRace && (
        <>
          {/* Selected Drivers */}
          <div className="glass rounded-xl p-6">
            <h2 className="text-xl font-bold text-white mb-4">Your Picks</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[0, 1, 2].map((slot) => {
                const driverId = selectedDrivers[slot];
                const driver = drivers.find((d) => d.id === driverId);
                const usage = driverId ? getDriverUsage(driverId) : 0;
                const maxUses = driverId ? getMaxUses(driverId) : BASE_DRIVER_USES;

                return (
                  <div
                    key={slot}
                    className={`border-2 rounded-lg p-4 ${
                      driver ? 'border-amber-400/50 bg-amber-500/10' : 'border-purple-600/50 border-dashed bg-purple-900/20'
                    }`}
                  >
                    <div className="text-sm text-purple-400 mb-2">Driver {slot + 1}</div>
                    {driver ? (
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-amber-400 font-bold">#{driver.car_number}</span>
                            <span className="text-white font-medium">{driver.name}</span>
                          </div>
                          <div className="text-sm text-purple-400">{driver.team_name}</div>
                          <div className={`text-sm ${
                            usage >= maxUses - 1 ? 'text-red-400' : 'text-purple-500'
                          }`}>
                            {usage}/{maxUses} uses
                          </div>
                        </div>
                        <button
                          onClick={() => handleDriverSelect(slot, null)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="text-purple-500 text-center py-2">
                        Select a driver below
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {error && (
              <div className="mt-4 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {success && (
              <div className="mt-4 bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 px-4 py-3 rounded-lg">
                Picks submitted successfully!
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting || (!existingPick && selectedDrivers.some((d) => !d))}
              className="mt-4 w-full py-3 px-4 rounded-lg text-sm font-bold text-purple-900 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:via-yellow-300 hover:to-amber-400 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-500/25 transition-all"
            >
              {submitting ? 'Submitting...' :
               existingPick && selectedDrivers.every((d) => !d) ? 'Delete Picks' :
               existingPick ? 'Update Picks' : 'Submit Picks'}
            </button>
          </div>

          {/* Driver Selection */}
          <div className="glass rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Available Drivers</h2>
              <input
                type="text"
                placeholder="Search drivers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white placeholder-purple-400/50 focus:outline-none focus:ring-2 focus:ring-purple-500 w-64"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-purple-400 text-sm border-b border-purple-700/30">
                    <th className="pb-3 pr-4">#</th>
                    <th className="pb-3 pr-4">Driver</th>
                    <th className="pb-3 pr-4">Team</th>
                    <th className="pb-3 text-center">Uses</th>
                    <th className="pb-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDrivers.map((driver) => {
                    const usage = getDriverUsage(driver.id);
                    const maxUses = getMaxUses(driver.id);
                    const available = isDriverAvailable(driver.id);
                    const selected = isDriverSelected(driver.id);

                    return (
                      <tr
                        key={driver.id}
                        className={`border-b border-purple-800/20 ${
                          selected ? 'bg-amber-500/10' : !available ? 'opacity-50' : ''
                        }`}
                      >
                        <td className="py-3 pr-4 text-amber-400 font-bold">
                          {driver.car_number}
                        </td>
                        <td className="py-3 pr-4 text-white">{driver.name}</td>
                        <td className="py-3 pr-4 text-purple-300">{driver.team_name}</td>
                        <td className="py-3 text-center">
                          <span className={`font-medium ${
                            usage >= maxUses ? 'text-red-400' :
                            usage >= maxUses - 1 ? 'text-amber-400' : 'text-white'
                          }`}>
                            {usage}/{maxUses}
                          </span>
                        </td>
                        <td className="py-3 text-center">
                          {selected ? (
                            <span className="text-amber-400 text-sm">Selected</span>
                          ) : !available ? (
                            <span className="text-red-400 text-sm">Maxed</span>
                          ) : (
                            <button
                              onClick={() => {
                                const emptySlot = selectedDrivers.findIndex((d) => d === null);
                                if (emptySlot !== -1) {
                                  handleDriverSelect(emptySlot, driver.id);
                                }
                              }}
                              disabled={selectedDrivers.every((d) => d !== null)}
                              className="px-3 py-1 bg-purple-700/30 text-purple-200 text-sm rounded-lg hover:bg-purple-700/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-purple-600/30"
                            >
                              Select
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
