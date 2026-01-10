import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Navbar from '@/components/Navbar';
import type { Profile, Team, TeamMembership } from '@/types';

export default async function DashboardLayout({
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

  // Fetch user's team membership
  const { data: membership } = await supabase
    .from('team_memberships')
    .select('*, team:teams(*)')
    .eq('user_id', user.id)
    .single();

  const userProfile = profile as Profile | null;
  const userTeam = membership?.team as Team | null;
  const isCommissioner = userProfile?.is_commissioner ?? false;

  return (
    <div className="min-h-screen bg-[#0c0a12]">
      <Navbar
        user={userProfile}
        team={userTeam}
        isCommissioner={isCommissioner}
      />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
