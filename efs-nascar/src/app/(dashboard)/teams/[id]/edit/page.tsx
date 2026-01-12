'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Team, Driver } from '@/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function EditTeamProfilePage({ params }: PageProps) {
  const router = useRouter();
  const supabase = createClient();

  const [teamId, setTeamId] = useState<string>('');
  const [team, setTeam] = useState<Team | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [abbreviation, setAbbreviation] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [headshotUrl, setHeadshotUrl] = useState('');
  const [favoriteDriverId, setFavoriteDriverId] = useState('');
  const [quote, setQuote] = useState('');
  const [bio, setBio] = useState('');

  // Image upload state
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingHeadshot, setUploadingHeadshot] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { id } = await params;
      setTeamId(id);
      await loadData(id);
    };
    init();
  }, [params]);

  const loadData = async (id: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      // Get team
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .select('*')
        .eq('id', id)
        .single();

      if (teamError || !teamData) {
        setError('Team not found');
        setLoading(false);
        return;
      }

      // Check if user is owner
      const { data: membership } = await supabase
        .from('team_memberships')
        .select('*')
        .eq('team_id', id)
        .eq('user_id', user.id)
        .eq('role', 'owner')
        .single();

      if (!membership) {
        setError('You must be a team owner to edit the profile');
        setLoading(false);
        return;
      }

      setIsOwner(true);
      setTeam(teamData);
      setAbbreviation(teamData.abbreviation || '');
      setLogoUrl(teamData.logo_url || '');
      setHeadshotUrl(teamData.owner_headshot_url || '');
      setFavoriteDriverId(teamData.favorite_driver_id || '');
      setQuote(teamData.quote || '');
      setBio(teamData.bio || '');

      // Get drivers for dropdown
      const { data: driversData } = await supabase
        .from('drivers')
        .select('*')
        .eq('is_active', true)
        .order('name');

      setDrivers(driversData || []);
      setLoading(false);
    } catch (err) {
      setError('Failed to load team data');
      setLoading(false);
    }
  };

  const handleImageUpload = async (file: File, type: 'logo' | 'headshot') => {
    if (!team) return;

    const setUploading = type === 'logo' ? setUploadingLogo : setUploadingHeadshot;
    setUploading(true);
    setError(null);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${team.id}/${type}-${Date.now()}.${fileExt}`;

      const { data, error: uploadError } = await supabase.storage
        .from('team-images')
        .upload(fileName, file, { upsert: true });

      if (uploadError) {
        throw uploadError;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('team-images')
        .getPublicUrl(fileName);

      if (type === 'logo') {
        setLogoUrl(publicUrl);
      } else {
        setHeadshotUrl(publicUrl);
      }
    } catch (err: any) {
      setError(`Failed to upload ${type}: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!team) return;

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const { error: updateError } = await supabase
        .from('teams')
        .update({
          abbreviation: abbreviation || null,
          logo_url: logoUrl || null,
          owner_headshot_url: headshotUrl || null,
          favorite_driver_id: favoriteDriverId || null,
          quote: quote || null,
          bio: bio || null,
        })
        .eq('id', team.id);

      if (updateError) throw updateError;

      setSuccess(true);
      setTimeout(() => {
        router.push(`/teams/${team.id}`);
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500"></div>
      </div>
    );
  }

  if (error && !team) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-6 py-4 rounded-lg">
          {error}
        </div>
        <Link href="/teams" className="mt-4 inline-block text-purple-400 hover:text-purple-300">
          ← Back to Teams
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Edit Team Profile</h1>
        <Link
          href={`/teams/${teamId}`}
          className="text-purple-400 hover:text-purple-300"
        >
          ← Back to Profile
        </Link>
      </div>

      {success && (
        <div className="bg-green-500/10 border border-green-500/50 text-green-400 px-6 py-4 rounded-lg">
          Profile saved successfully! Redirecting...
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-6 py-4 rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Team Logo */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Team Logo</h2>
          <div className="flex items-start space-x-6">
            <div className="w-24 h-24 bg-gray-700 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="Team logo" className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl font-bold text-yellow-500">#{team?.car_number}</span>
              )}
            </div>
            <div className="flex-1 space-y-3">
              <input
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="Paste image URL or upload below"
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <div>
                <label className="cursor-pointer inline-flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors">
                  {uploadingLogo ? 'Uploading...' : 'Upload Image'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingLogo}
                    onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'logo')}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Owner Headshot */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Owner Headshot</h2>
          <div className="flex items-start space-x-6">
            <div className="w-24 h-24 bg-gray-700 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
              {headshotUrl ? (
                <img src={headshotUrl} alt="Owner headshot" className="w-full h-full object-cover" />
              ) : (
                <svg className="w-12 h-12 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              )}
            </div>
            <div className="flex-1 space-y-3">
              <input
                type="url"
                value={headshotUrl}
                onChange={(e) => setHeadshotUrl(e.target.value)}
                placeholder="Paste image URL or upload below"
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <div>
                <label className="cursor-pointer inline-flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors">
                  {uploadingHeadshot ? 'Uploading...' : 'Upload Image'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingHeadshot}
                    onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'headshot')}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Team Abbreviation */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Team Abbreviation</h2>
          <input
            type="text"
            value={abbreviation}
            onChange={(e) => setAbbreviation(e.target.value.toUpperCase())}
            placeholder="e.g., ABBR"
            maxLength={10}
            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 uppercase"
          />
          <p className="mt-2 text-sm text-gray-500">Short abbreviation used in mobile views (max 10 characters)</p>
        </div>

        {/* Favorite Driver */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Favorite NASCAR Driver</h2>
          <select
            value={favoriteDriverId}
            onChange={(e) => setFavoriteDriverId(e.target.value)}
            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="">Select a driver...</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                #{driver.car_number} - {driver.name} ({driver.team_name})
              </option>
            ))}
          </select>
        </div>

        {/* Quote */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Team Quote</h2>
          <input
            type="text"
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            placeholder="Enter a team motto or catchphrase..."
            maxLength={200}
            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <p className="mt-2 text-sm text-gray-500">{quote.length}/200 characters</p>
        </div>

        {/* Bio */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Team Bio</h2>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell us about your team..."
            rows={5}
            maxLength={1000}
            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
          />
          <p className="mt-2 text-sm text-gray-500">{bio.length}/1000 characters</p>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end space-x-4">
          <Link
            href={`/teams/${teamId}`}
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving || uploadingLogo || uploadingHeadshot}
            className="px-6 py-3 bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600 text-black font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </form>
    </div>
  );
}
