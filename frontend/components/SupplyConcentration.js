"use client";
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export default function SupplyConcentration({ topN_percent_supply }) {
  if (!topN_percent_supply) {
    return (
      <div className="bg-surface p-4 space-y-3">
        <h3 className="text-sm font-semibold text-white font-satoshi">Supply Concentration</h3>
        <div className="text-gray-400 text-sm">No data available</div>
      </div>
    );
  }

  // Prepare data for the pie chart
  const data = [
    { name: 'Top 1', value: topN_percent_supply.top1 || 0 },
    { name: 'Top 10', value: (topN_percent_supply.top10 || 0) - (topN_percent_supply.top1 || 0) },
    { name: 'Top 50', value: (topN_percent_supply.top50 || 0) - (topN_percent_supply.top10 || 0) },
    { name: 'Top 100', value: (topN_percent_supply.top100 || 0) - (topN_percent_supply.top50 || 0) },
    { name: 'Others', value: 1 - (topN_percent_supply.top100 || 0) }
  ].filter(item => item.value > 0);

  const formatPercent = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 2
    }).format(value);
  };

  return (
    <div className="bg-surface p-4 space-y-3">
      <h3 className="text-sm font-semibold text-white font-satoshi">Supply Concentration</h3>
      
      {/* Pie Chart */}
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={80}
              fill="#8884d8"
              paddingAngle={5}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${entry.name}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        {data.map((entry, index) => (
          <div key={entry.name} className="flex items-center space-x-2">
            <div 
              className="w-3 h-3 rounded-full" 
              style={{ backgroundColor: COLORS[index % COLORS.length] }}
            />
            <span className="text-gray-300">{entry.name}</span>
            <span className="text-white font-medium ml-auto">
              {formatPercent(entry.value)}
            </span>
          </div>
        ))}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-gray-800/50 p-2 rounded">
          <div className="text-gray-400">Top 1</div>
          <div className="text-white font-semibold">
            {formatPercent(topN_percent_supply.top1 || 0)}
          </div>
        </div>
        <div className="bg-gray-800/50 p-2 rounded">
          <div className="text-gray-400">Top 10</div>
          <div className="text-white font-semibold">
            {formatPercent(topN_percent_supply.top10 || 0)}
          </div>
        </div>
        <div className="bg-gray-800/50 p-2 rounded">
          <div className="text-gray-400">Top 50</div>
          <div className="text-white font-semibold">
            {formatPercent(topN_percent_supply.top50 || 0)}
          </div>
        </div>
        <div className="bg-gray-800/50 p-2 rounded">
          <div className="text-gray-400">Top 100</div>
          <div className="text-white font-semibold">
            {formatPercent(topN_percent_supply.top100 || 0)}
          </div>
        </div>
      </div>
    </div>
  );
}
