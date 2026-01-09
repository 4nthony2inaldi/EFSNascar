'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Team, Profile, TeamMembership } from '@/types';

interface TeamWithMembers extends Team {
  team_memberships: (TeamMembership & { profile: Profile })[];
}

export default function AdminTeamsPage() {
  const supabase = createClient();
  const [teams, setTeams] = useState<TeamWithMembers[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    car_number: 1,
  });
  const [error, setError] = useState<string | null>(null);

  // Assignment modal
  const [assigningTeam, setAssigningTeam] = useState<Team | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<'member' | 'owner'>('owner');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    // Load teams with memberships
    const { data: teamsData } = await supabase
      .from('teams')
      .select(`
        *,
        team_memberships(
          *,
          profile:profiles(*)
        )
      `)
      .order('car_number', { ascending: true });

    setTeams((teamsData as TeamWithMembers[]) || []);

    // Load all users
    const { data: usersData } = await supabase
      .from('profiles')
      .select('*')
      .order('name', { ascending: true });

    setUsers(usersData || []);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const teamData = {
      name: formData.name,
      car_number: formData.car_number,
    };

    if (editingTeam) {
      const { error } = await supabase
        .from('teams')
        .update(teamData)
        .eq('id', editingTeam.id);

      if (error) {
        setError(error.message);
        return;
      }
    } else {
      const { error } = await supabase.from('teams').insert(teamData);

      if (error) {
        setError(error.message);
        return;
      }
    }

    setShowForm(false);
    setEditingTeam(null);
    setFormData({ name: '', car_number: 1 });
    loadData();
  };

  const handleEdit = (team: Team) => {
    setEditingTeam(team);
    setFormData({
      name: team.name,
      car_number: team.car_number,
    });
    setShowForm(true);
  };

  const handleDelete = async (team: Team) => {
    if (!confirm(`Delete team "${team.name}"? This will remove all associated data.`)) return;

    const { error } = await supabase.from('teams').delete().eq('id', team.id);
    if (error) {
      alert(`Cannot delete: ${error.message}`);
      return;
    }
    loadData();
  };

  const handleAssignUser = async () => {
    if (!assigningTeam || !selectedUserId) return;

    // Check if user already assigned to a team
    const { data: existingMembership } = await supabase
      .from('team_memberships')
      .select('*, team:teams(name)')
      .eq('user_id', selectedUserId)
      .single();

    if (existingMembership) {
      if (!confirm(`This user is already assigned to "${(existingMembership as any).team?.name}". Remove them and assign to "${assigningTeam.name}"?`)) {
        return;
      }
      // Remove from old team
      await supabase
        .from('team_memberships')
        .delete()
        .eq('user_id', selectedUserId);
    }

    // Add to new team
    const { error } = await supabase.from('team_memberships').insert({
      user_id: selectedUserId,
      team_id: assigningTeam.id,
      role: selectedRole,
      accepted_at: new Date().toISOString(),
    });

    if (error) {
      alert(`Error: ${error.message}`);
      return;
    }

    setAssigningTeam(null);
    setSelectedUserId('');
    loadData();
  };

  const handleRemoveMember = async (membershipId: string) => {
    if (!confirm('Remove this member from the team?')) return;

    await supabase.from('team_memberships').delete().eq('id', membershipId);
    loadData();
  };

  const handleToggleCommissioner = async (userId: string, currentStatus: boolean) => {
    await supabase
      .from('profiles')
      .update({ is_commissioner: !currentStatus })
      .eq('id', userId);
    loadData();
  };

  if (loading) {
    return <div className="text-gray-400">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Manage Teams</h2>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingTeam(null);
            setFormData({ name: '', car_number: teams.length + 1 });
          }}
          className="px-4 py-2 bg-yellow-500 text-black font-medium rounded-md hover:bg-yellow-400 transition-colors"
        >
          Add Team
        </button>
      </div>

      {/* Team Form */}
      {showForm && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-bold text-white mb-4">
            {editingTeam ? 'Edit Team' : 'Add New Team'}
          </h3>
          {error && (
            <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Car #</label>
                <input
                  type="number"
                  value={formData.car_number}
                  onChange={(e) => setFormData({ ...formData, car_number: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                  required
                  min={1}
                  max={99}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Team Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Sofa King Racing"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                  required
                />
              </div>
            </div>
            <div className="flex space-x-4">
              <button
                type="submit"
                className="px-4 py-2 bg-yellow-500 text-black font-medium rounded-md hover:bg-yellow-400 transition-colors"
              >
                {editingTeam ? 'Update' : 'Create'} Team
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingTeam(null);
                }}
                className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Assignment Modal */}
      {assigningTeam && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-white mb-4">
              Assign User to {assigningTeam.name}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">User</label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                >
                  <option value="">Select a user...</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.email})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Role</label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as 'member' | 'owner')}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                >
                  <option value="owner">Owner</option>
                  <option value="member">Member</option>
                </select>
              </div>
              <div className="flex space-x-4">
                <button
                  onClick={handleAssignUser}
                  disabled={!selectedUserId}
                  className="px-4 py-2 bg-yellow-500 text-black font-medium rounded-md hover:bg-yellow-400 disabled:opacity-50 transition-colors"
                >
                  Assign
                </button>
                <button
                  onClick={() => {
                    setAssigningTeam(null);
                    setSelectedUserId('');
                  }}
                  className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Teams List */}
      <div className="space-y-4">
        {teams.map((team) => (
          <div key={team.id} className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center">
                  <span className="text-xl font-bold text-yellow-500">#{team.car_number}</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{team.name}</h3>
                  <p className="text-gray-400 text-sm">
                    {team.team_memberships?.length || 0} member(s)
                  </p>
                </div>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setAssigningTeam(team)}
                  className="px-3 py-1 bg-green-500/20 text-green-500 rounded text-sm hover:bg-green-500/30 transition-colors"
                >
                  Assign User
                </button>
                <button
                  onClick={() => handleEdit(team)}
                  className="px-3 py-1 bg-yellow-500/20 text-yellow-500 rounded text-sm hover:bg-yellow-500/30 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(team)}
                  className="px-3 py-1 bg-red-500/20 text-red-500 rounded text-sm hover:bg-red-500/30 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>

            {/* Team Members */}
            {team.team_memberships && team.team_memberships.length > 0 && (
              <div className="border-t border-gray-700 pt-4">
                <h4 className="text-sm font-medium text-gray-400 mb-2">Members</h4>
                <div className="space-y-2">
                  {team.team_memberships.map((membership) => (
                    <div
                      key={membership.id}
                      className="flex items-center justify-between bg-gray-700 rounded px-3 py-2"
                    >
                      <div className="flex items-center space-x-3">
                        <span className="text-white">{membership.profile?.name}</span>
                        <span className="text-gray-400 text-sm">{membership.profile?.email}</span>
                        <span className={`px-2 py-0.5 text-xs rounded ${
                          membership.role === 'owner'
                            ? 'bg-yellow-500/20 text-yellow-500'
                            : 'bg-gray-600 text-gray-300'
                        }`}>
                          {membership.role}
                        </span>
                        {membership.profile?.is_commissioner && (
                          <span className="px-2 py-0.5 text-xs rounded bg-red-500/20 text-red-500">
                            Commissioner
                          </span>
                        )}
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleToggleCommissioner(membership.user_id, membership.profile?.is_commissioner || false)}
                          className="text-gray-400 hover:text-white text-sm"
                        >
                          {membership.profile?.is_commissioner ? 'Remove Admin' : 'Make Admin'}
                        </button>
                        <button
                          onClick={() => handleRemoveMember(membership.id)}
                          className="text-red-500 hover:text-red-400 text-sm"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {teams.length === 0 && (
        <div className="bg-gray-800 rounded-lg p-12 text-center">
          <p className="text-gray-400">No teams created yet.</p>
        </div>
      )}

      {/* Unassigned Users */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-bold text-white mb-4">Registered Users</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                <th className="pb-3">Name</th>
                <th className="pb-3">Email</th>
                <th className="pb-3">Team</th>
                <th className="pb-3">Admin</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const membership = teams
                  .flatMap((t) => t.team_memberships || [])
                  .find((m) => m.user_id === user.id);
                const team = membership ? teams.find((t) => t.id === membership.team_id) : null;

                return (
                  <tr key={user.id} className="border-b border-gray-700/50">
                    <td className="py-3 text-white">{user.name}</td>
                    <td className="py-3 text-gray-400">{user.email}</td>
                    <td className="py-3">
                      {team ? (
                        <span className="text-yellow-500">#{team.car_number} {team.name}</span>
                      ) : (
                        <span className="text-gray-500">Unassigned</span>
                      )}
                    </td>
                    <td className="py-3">
                      {user.is_commissioner ? (
                        <span className="px-2 py-1 bg-red-500/20 text-red-500 text-xs rounded">Yes</span>
                      ) : (
                        <span className="text-gray-500">No</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
