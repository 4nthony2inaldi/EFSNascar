'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push('/');
    router.refresh();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0a1a] px-4 relative overflow-hidden">
      {/* Background decorations - stars pattern */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-600/30 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-yellow-500/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/4 left-1/4 w-4 h-4 text-yellow-400 opacity-30">★</div>
        <div className="absolute top-1/3 right-1/4 w-4 h-4 text-yellow-400 opacity-20">★</div>
        <div className="absolute bottom-1/4 left-1/3 w-4 h-4 text-yellow-400 opacity-25">★</div>
        <div className="absolute bottom-1/3 right-1/3 w-4 h-4 text-yellow-400 opacity-15">★</div>
      </div>

      <div className="max-w-md w-full space-y-8 relative z-10">
        <div className="text-center">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <span className="text-yellow-400 font-black text-3xl tracking-tight bg-purple-700 px-3 py-1 rounded">EFS</span>
            <span className="font-black text-3xl tracking-tight">
              <span className="text-yellow-400">N</span>
              <span className="text-yellow-300">A</span>
              <span className="text-yellow-400">S</span>
              <span className="text-purple-400">C</span>
              <span className="text-purple-300">A</span>
              <span className="text-yellow-400">R</span>
            </span>
          </div>
          <p className="mt-2 text-purple-300 text-lg">Fantasy League</p>
        </div>

        <div className="glass rounded-2xl shadow-2xl p-8 border border-purple-500/20">
          <h2 className="text-2xl font-bold text-white mb-6">Sign In</h2>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-purple-200">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1 block w-full px-4 py-3 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white placeholder-purple-400/50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-purple-200">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="mt-1 block w-full px-4 py-3 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white placeholder-purple-400/50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-3 px-4 rounded-lg text-sm font-bold text-purple-900 bg-gradient-to-r from-yellow-400 via-yellow-300 to-yellow-400 hover:from-yellow-300 hover:via-yellow-200 hover:to-yellow-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 focus:ring-offset-[#1c1726] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-yellow-500/25 transition-all"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-purple-300">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-yellow-400 hover:text-yellow-300 font-medium">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
