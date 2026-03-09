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
    { href: '/admin/scoring', label: 'Scoring' },
    { href: '/admin/races', label: 'Races' },
    { href: '/admin/schedule', label: 'Schedule Mgmt' },
    { href: '/admin/drivers', label: 'Drivers' },
    { href: '/admin/results', label: 'Results' },
    { href: '/admin/import', label: 'API Import' },
    { href: '/admin/picks-import', label: 'Picks Import' },
    { href: '/admin/results-import', label: 'Results Import' },
    { href: '/admin/fix-race-links', label: 'Fix Race Links' },
    { href: '/admin/fix-pick-links', label: 'Fix Pick Links' },
    { href: '/admin/teams', label: 'Teams' },
    { href: '/admin/commissioner-report', label: 'Report' },
  ];

  return (
    <div className="min-h-screen bg-[#0c0a12]">
      <Navbar
        user={userProfile}
        team={userTeam}
        isCommissioner={true}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Admin Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500">Commissioner Panel</h1>
          <p className="text-purple-400">Manage the EFS NASCAR Fantasy League</p>
        </div>

        {/* Admin Navigation */}
        <div className="flex flex-wrap gap-2 mb-8">
          {adminLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-4 py-2 bg-purple-900/30 text-purple-200 rounded-lg text-sm font-medium hover:bg-purple-800/40 hover:text-white transition-colors border border-purple-700/30"
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
