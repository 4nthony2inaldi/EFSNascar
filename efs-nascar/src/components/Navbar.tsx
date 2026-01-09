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
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <nav className="bg-gray-800 border-b border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2">
              <span className="text-yellow-500 font-bold text-xl">EFS</span>
              <span className="text-white font-bold text-xl">NASCAR</span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-4">
            {user && (
              <>
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive(link.href)
                        ? 'bg-gray-900 text-yellow-500'
                        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
                {isCommissioner && (
                  <Link
                    href="/admin"
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      pathname.startsWith('/admin')
                        ? 'bg-red-900 text-red-300'
                        : 'text-red-400 hover:bg-red-900/50 hover:text-red-300'
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
                    className="text-sm text-gray-300 hover:text-white"
                  >
                    <span className="text-yellow-500 font-bold">#{team.car_number}</span>{' '}
                    {team.name}
                  </Link>
                )}
                <div className="text-sm text-gray-400">{user.name}</div>
                <button
                  onClick={handleSignOut}
                  className="text-sm text-gray-400 hover:text-white"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="px-4 py-2 rounded-md text-sm font-medium bg-yellow-500 text-black hover:bg-yellow-400 transition-colors"
              >
                Sign In
              </Link>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-gray-400 hover:text-white"
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
        <div className="md:hidden">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            {user && (
              <>
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block px-3 py-2 rounded-md text-base font-medium ${
                      isActive(link.href)
                        ? 'bg-gray-900 text-yellow-500'
                        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
                {isCommissioner && (
                  <Link
                    href="/admin"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block px-3 py-2 rounded-md text-base font-medium ${
                      pathname.startsWith('/admin')
                        ? 'bg-red-900 text-red-300'
                        : 'text-red-400 hover:bg-red-900/50'
                    }`}
                  >
                    Admin
                  </Link>
                )}
                <div className="border-t border-gray-700 mt-3 pt-3">
                  {team && (
                    <Link
                      href={`/teams/${team.id}`}
                      onClick={() => setMobileMenuOpen(false)}
                      className="block px-3 py-2 text-sm text-gray-300"
                    >
                      <span className="text-yellow-500 font-bold">#{team.car_number}</span>{' '}
                      {team.name}
                    </Link>
                  )}
                  <div className="px-3 py-2 text-sm text-gray-400">{user.name}</div>
                  <button
                    onClick={handleSignOut}
                    className="block w-full text-left px-3 py-2 text-sm text-gray-400 hover:text-white"
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
                className="block px-3 py-2 rounded-md text-base font-medium bg-yellow-500 text-black"
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
