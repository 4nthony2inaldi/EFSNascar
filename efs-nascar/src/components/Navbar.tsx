'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Profile, Team } from '@/types';

interface NavbarProps {
  user: Profile | null;
  team: Team | null;
  isCommissioner: boolean;
}

export default function Navbar({ user, team, isCommissioner }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const navLinks = [
    { href: '/', label: 'Dashboard' },
    { href: '/standings', label: 'Standings' },
    { href: '/picks', label: 'Picks' },
    { href: '/schedule', label: 'Schedule' },
    { href: '/teams', label: 'Teams' },
    { href: '/driver-rankings', label: 'Drivers' },
    { href: '/rules', label: 'Rules' },
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <nav className="bg-[#13101a]/95 backdrop-blur-md border-b border-purple-900/30 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-1 group">
              <span className="text-yellow-400 font-black text-xl tracking-tight bg-purple-700 px-2 py-0.5 rounded">EFS</span>
              <span className="font-black text-xl tracking-tight">
                <span className="text-yellow-400">N</span>
                <span className="text-yellow-300">A</span>
                <span className="text-yellow-400">S</span>
                <span className="text-purple-400">C</span>
                <span className="text-purple-300">A</span>
                <span className="text-yellow-400">R</span>
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            {user && (
              <>
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      isActive(link.href)
                        ? 'bg-gradient-to-r from-purple-600/30 to-purple-800/30 text-amber-400 border border-purple-500/30'
                        : 'text-purple-200 hover:bg-purple-800/20 hover:text-white'
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
                {isCommissioner && (
                  <Link
                    href="/admin"
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      pathname.startsWith('/admin')
                        ? 'bg-gradient-to-r from-amber-600/30 to-amber-800/30 text-amber-300 border border-amber-500/30'
                        : 'text-amber-400/80 hover:bg-amber-900/20 hover:text-amber-300'
                    }`}
                  >
                    Admin
                  </Link>
                )}
              </>
            )}
          </div>

          {/* User Menu */}
          <div className="hidden md:flex items-center space-x-4">
            {user ? (
              <div className="flex items-center space-x-4">
                {team && (
                  <Link
                    href={`/teams/${team.id}`}
                    className="text-sm text-purple-200 hover:text-white flex items-center space-x-1 group"
                  >
                    <span className="text-amber-400 font-bold group-hover:text-amber-300">#{team.car_number}</span>
                    <span className="text-purple-300 group-hover:text-white">{team.name}</span>
                  </Link>
                )}
                <div className="h-4 w-px bg-purple-700/50"></div>
                <div className="text-sm text-purple-400">{user.name}</div>
                <button
                  onClick={handleSignOut}
                  className="text-sm text-purple-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-purple-800/30 transition-all"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="px-5 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-amber-500 to-yellow-500 text-purple-900 hover:from-amber-400 hover:to-yellow-400 transition-all shadow-lg shadow-amber-500/20"
              >
                Sign In
              </Link>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-purple-300 hover:text-white p-2 rounded-lg hover:bg-purple-800/30"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-purple-800/30 bg-[#13101a]/98 backdrop-blur-md">
          <div className="px-3 pt-3 pb-4 space-y-1">
            {user && (
              <>
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block px-4 py-3 rounded-lg text-base font-medium ${
                      isActive(link.href)
                        ? 'bg-purple-800/30 text-amber-400 border border-purple-500/30'
                        : 'text-purple-200 hover:bg-purple-800/20 hover:text-white'
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
                {isCommissioner && (
                  <Link
                    href="/admin"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block px-4 py-3 rounded-lg text-base font-medium ${
                      pathname.startsWith('/admin')
                        ? 'bg-amber-800/30 text-amber-300 border border-amber-500/30'
                        : 'text-amber-400/80 hover:bg-amber-900/20'
                    }`}
                  >
                    Admin
                  </Link>
                )}
                <div className="border-t border-purple-800/30 mt-3 pt-3">
                  {team && (
                    <Link
                      href={`/teams/${team.id}`}
                      onClick={() => setMobileMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-purple-300"
                    >
                      <span className="text-amber-400 font-bold">#{team.car_number}</span>{' '}
                      {team.name}
                    </Link>
                  )}
                  <div className="px-4 py-2 text-sm text-purple-400">{user.name}</div>
                  <button
                    onClick={handleSignOut}
                    className="block w-full text-left px-4 py-2 text-sm text-purple-400 hover:text-white rounded-lg hover:bg-purple-800/30"
                  >
                    Sign Out
                  </button>
                </div>
              </>
            )}
            {!user && (
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-4 py-3 rounded-lg text-base font-semibold text-center bg-gradient-to-r from-amber-500 to-yellow-500 text-purple-900"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
