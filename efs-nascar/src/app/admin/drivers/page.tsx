'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Driver } from '@/types';

export default function AdminDriversPage() {
  const supabase = createClient();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    car_number: 0,
    team_name: '',
    is_active: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadDrivers();
  }, []);

  const loadDrivers = async () => {
    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .order('car_number', { ascending: true });

    if (error) {
      console.error('Error loading drivers:', error);
    } else {
      setDrivers(data || []);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const driverData = {
      name: formData.name,
      car_number: formData.car_number,
      team_name: formData.team_name || null,
      is_active: formData.is_active,
    };

    if (editingDriver) {
      const { error } = await supabase
        .from('drivers')
        .update(driverData)
        .eq('id', editingDriver.id);

      if (error) {
        setError(error.message);
        return;
      }
    } else {
      const { error } = await supabase.from('drivers').insert(driverData);

      if (error) {
        setError(error.message);
        return;
      }
    }

    setShowForm(false);
    setEditingDriver(null);
    setFormData({ name: '', car_number: 0, team_name: '', is_active: true });
    loadDrivers();
  };

  const handleEdit = (driver: Driver) => {
    setEditingDriver(driver);
    setFormData({
      name: driver.name,
      car_number: driver.car_number,
      team_name: driver.team_name || '',
      is_active: driver.is_active,
    });
    setShowForm(true);
  };

  const handleToggleActive = async (driver: Driver) => {
    await supabase
      .from('drivers')
      .update({ is_active: !driver.is_active })
      .eq('id', driver.id);
    loadDrivers();
  };

  const handleDelete = async (driver: Driver) => {
    if (!confirm(`Delete driver "${driver.name}"? This cannot be undone.`)) return;

    const { error } = await supabase.from('drivers').delete().eq('id', driver.id);
    if (error) {
      alert(`Cannot delete: ${error.message}`);
      return;
    }
    loadDrivers();
  };

  const filteredDrivers = drivers.filter((driver) =>
    driver.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    driver.car_number.toString().includes(searchTerm) ||
    driver.team_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <div className="text-gray-400">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-bold text-white">Manage Drivers</h2>
          <input
            type="text"
            placeholder="Search drivers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 w-64"
          />
        </div>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingDriver(null);
            setFormData({ name: '', car_number: 0, team_name: '', is_active: true });
          }}
          className="px-4 py-2 bg-yellow-500 text-black font-medium rounded-md hover:bg-yellow-400 transition-colors"
        >
          Add Driver
        </button>
      </div>

      {/* Stats */}
      <div className="flex space-x-4 text-sm">
        <span className="text-gray-400">
          Total: <span className="text-white font-bold">{drivers.length}</span>
        </span>
        <span className="text-gray-400">
          Active: <span className="text-green-500 font-bold">{drivers.filter((d) => d.is_active).length}</span>
        </span>
        <span className="text-gray-400">
          Inactive: <span className="text-red-500 font-bold">{drivers.filter((d) => !d.is_active).length}</span>
        </span>
      </div>

      {/* Driver Form */}
      {showForm && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-bold text-white mb-4">
            {editingDriver ? 'Edit Driver' : 'Add New Driver'}
          </h3>
          {error && (
            <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                <label className="block text-sm font-medium text-gray-300 mb-1">Driver Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Kyle Larson"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">NASCAR Team</label>
                <input
                  type="text"
                  value={formData.team_name}
                  onChange={(e) => setFormData({ ...formData, team_name: e.target.value })}
                  placeholder="e.g., Hendrick Motorsports"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-gray-300">Active</span>
                </label>
              </div>
            </div>
            <div className="flex space-x-4">
              <button
                type="submit"
                className="px-4 py-2 bg-yellow-500 text-black font-medium rounded-md hover:bg-yellow-400 transition-colors"
              >
                {editingDriver ? 'Update' : 'Create'} Driver
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingDriver(null);
                }}
                className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Drivers List */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-900 text-left text-gray-400 text-sm">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Driver</th>
                <th className="px-4 py-3">NASCAR Team</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDrivers.map((driver) => (
                <tr
                  key={driver.id}
                  className={`border-b border-gray-700 ${!driver.is_active ? 'opacity-50' : ''}`}
                >
                  <td className="px-4 py-3 text-yellow-500 font-bold">{driver.car_number}</td>
                  <td className="px-4 py-3 text-white">{driver.name}</td>
                  <td className="px-4 py-3 text-gray-400">{driver.team_name || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs rounded ${
                      driver.is_active ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'
                    }`}>
                      {driver.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleEdit(driver)}
                        className="text-yellow-500 hover:text-yellow-400 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleActive(driver)}
                        className={`text-sm ${driver.is_active ? 'text-red-500 hover:text-red-400' : 'text-green-500 hover:text-green-400'}`}
                      >
                        {driver.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleDelete(driver)}
                        className="text-red-500 hover:text-red-400 text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredDrivers.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            {searchTerm ? 'No drivers match your search.' : 'No drivers created yet.'}
          </div>
        )}
      </div>
    </div>
  );
}
