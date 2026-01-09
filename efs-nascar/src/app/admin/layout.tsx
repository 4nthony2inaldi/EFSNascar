import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import Navbar from '@/components/Navbar';
import type { Profile, Team } from '@/types';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile?.is_commissioner) {
    redirect('/');
  }

  // Fetch user's team membership
  const { data: membership } = await supabase
    .from('team_memberships')
    .select('*, team:teams(*)')
    .eq('user_id', user.id)
    .single();

  const userProfile = profile as Profile;
  const userTeam = membership?.team as Team | null;

  const adminLinks = [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/seasons', label: 'Seasons' },
    { href: '/admin/races', label: 'Races' },
    { href: '/admin/drivers', label: 'Drivers' },
    { href: '/admin/results', label: 'Results' },
    { href: '/admin/teams', label: 'Teams' },
  ];

  return (
    <div className="min-h-screen bg-gray-900">
      <Navbar
        user={userProfile}
        team={userTeam}
        isCommissioner={true}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Admin Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-red-500">Commissioner Panel</h1>
          <p className="text-gray-400">Manage the EFS NASCAR Fantasy League</p>
        </div>

        {/* Admin Navigation */}
        <div className="flex flex-wrap gap-2 mb-8">
          {adminLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-4 py-2 bg-gray-800 text-gray-300 rounded-md text-sm font-medium hover:bg-gray-700 hover:text-white transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {children}
      </div>
    </div>
  );
}
