'use client';

import { useState } from 'react';
import { nascarHistory, type HistoricalSeason, type HistoricalRace } from '@/data/nascar-history';

export default function HistoryPage() {
  const [selectedSeason, setSelectedSeason] = useState<HistoricalSeason | null>(null);
  const [selectedRace, setSelectedRace] = useState<HistoricalRace | null>(null);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Show race details
  if (selectedRace) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => setSelectedRace(null)}
          className="text-purple-400 hover:text-purple-300 flex items-center space-x-2"
        >
          <span>←</span>
          <span>Back to {selectedSeason?.year} Season</span>
        </button>

        {/* Race Header */}
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-purple-400 text-sm">Race {selectedRace.raceNumber}</p>
              <h1 className="text-2xl font-bold text-white">{selectedRace.name}</h1>
              <p className="text-gray-400">{selectedRace.track}</p>
              <p className="text-gray-500 text-sm">{formatDate(selectedRace.date)}</p>
            </div>
            <div className="text-right">
              <p className="text-gray-400 text-sm">Winner</p>
              <p className="text-2xl font-bold text-yellow-400">
                #{selectedRace.winnerNumber} {selectedRace.winner}
              </p>
            </div>
          </div>
        </div>

        {/* Race Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Stage Winners */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Stage Winners</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Stage 1</span>
                <span className="text-white">
                  <span className="text-yellow-500 font-bold">#{selectedRace.stage1WinnerNumber}</span>{' '}
                  {selectedRace.stage1Winner}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Stage 2</span>
                <span className="text-white">
                  <span className="text-yellow-500 font-bold">#{selectedRace.stage2WinnerNumber}</span>{' '}
                  {selectedRace.stage2Winner}
                </span>
              </div>
            </div>
          </div>

          {/* Laps Led Leader */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Most Laps Led</h2>
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-400">
                #{selectedRace.lapsLedWinnerNumber} {selectedRace.lapsLedWinner}
              </p>
              <p className="text-gray-400 mt-2">
                {selectedRace.lapsLed} of {selectedRace.totalLaps} laps
              </p>
            </div>
          </div>

          {/* Race Info */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Race Info</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">Total Laps</span>
                <span className="text-white">{selectedRace.totalLaps}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Date</span>
                <span className="text-white">{formatDate(selectedRace.date)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Full Results */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Top 10 Results</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                  <th className="pb-3 pr-4">Pos</th>
                  <th className="pb-3 pr-4">#</th>
                  <th className="pb-3 pr-4">Driver</th>
                  <th className="pb-3">Team</th>
                </tr>
              </thead>
              <tbody>
                {selectedRace.results.map((result) => (
                  <tr key={result.position} className="border-b border-gray-700/50">
                    <td className="py-3 pr-4">
                      <span className={`font-bold ${
                        result.position === 1 ? 'text-yellow-400' :
                        result.position <= 3 ? 'text-green-400' :
                        result.position <= 10 ? 'text-white' : 'text-gray-400'
                      }`}>
                        {result.position}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-yellow-500 font-bold">{result.carNumber}</td>
                    <td className="py-3 pr-4 text-white">{result.driver}</td>
                    <td className="py-3 text-gray-400">{result.team}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // Show season races
  if (selectedSeason) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => setSelectedSeason(null)}
          className="text-purple-400 hover:text-purple-300 flex items-center space-x-2"
        >
          <span>←</span>
          <span>Back to All Seasons</span>
        </button>

        {/* Season Header */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h1 className="text-2xl font-bold text-white">{selectedSeason.name}</h1>
          <div className="mt-2 flex flex-wrap gap-4">
            <div>
              <span className="text-gray-400">Champion: </span>
              <span className="text-yellow-400 font-bold">{selectedSeason.champion}</span>
            </div>
            <div>
              <span className="text-gray-400">Team: </span>
              <span className="text-white">{selectedSeason.championTeam}</span>
            </div>
            <div>
              <span className="text-gray-400">Races: </span>
              <span className="text-white">{selectedSeason.races.length}</span>
            </div>
          </div>
        </div>

        {/* Race List */}
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-gray-400 text-sm border-b border-gray-700 bg-gray-800/50">
                  <th className="px-6 py-4">#</th>
                  <th className="px-6 py-4">Race</th>
                  <th className="px-6 py-4">Track</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Winner</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody>
                {selectedSeason.races.map((race) => (
                  <tr
                    key={race.raceNumber}
                    className="border-b border-gray-700/50 hover:bg-gray-700/30 cursor-pointer"
                    onClick={() => setSelectedRace(race)}
                  >
                    <td className="px-6 py-4 text-gray-400">{race.raceNumber}</td>
                    <td className="px-6 py-4 text-white font-medium">{race.name}</td>
                    <td className="px-6 py-4 text-gray-400">{race.track}</td>
                    <td className="px-6 py-4 text-gray-400">{formatDate(race.date)}</td>
                    <td className="px-6 py-4">
                      <span className="text-yellow-500 font-bold">#{race.winnerNumber}</span>{' '}
                      <span className="text-white">{race.winner}</span>
                    </td>
                    <td className="px-6 py-4 text-purple-400">
                      View →
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // Show all seasons
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">NASCAR History</h1>
        <p className="text-gray-400 mt-1">Race results from 2020 to present</p>
      </div>

      {/* Season Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {nascarHistory.map((season) => (
          <div
            key={season.year}
            onClick={() => setSelectedSeason(season)}
            className="bg-gray-800 rounded-lg p-6 hover:bg-gray-700/50 cursor-pointer transition-colors border border-gray-700 hover:border-purple-500/50"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-3xl font-bold text-white">{season.year}</span>
              <span className="text-gray-400">{season.races.length} races</span>
            </div>
            <div className="space-y-2">
              <div>
                <span className="text-gray-500 text-sm">Champion</span>
                <p className="text-yellow-400 font-bold">{season.champion}</p>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Team</span>
                <p className="text-gray-300">{season.championTeam}</p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-700">
              <span className="text-purple-400 text-sm">View Season →</span>
            </div>
          </div>
        ))}
      </div>

      {/* All-Time Stats */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-bold text-white mb-4">Recent Champions</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {nascarHistory.filter(s => s.champion !== 'TBD').map((season) => (
            <div key={season.year} className="text-center p-3 bg-gray-700/50 rounded-lg">
              <p className="text-2xl font-bold text-yellow-400">{season.year}</p>
              <p className="text-white text-sm mt-1">{season.champion}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
