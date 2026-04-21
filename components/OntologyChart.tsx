'use client'

import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts'

type OntologyScores = {
  l1: number
  l2: number
  l3: number
  l4: number
  l5: number
}

export default function OntologyChart({ scores }: { scores: OntologyScores }) {
  const data = [
    { subject: 'L1 철학', A: scores.l1, fullMark: 100 },
    { subject: 'L2 문체', A: scores.l2, fullMark: 100 },
    { subject: 'L3 수사', A: scores.l3, fullMark: 100 },
    { subject: 'L4 윤리', A: scores.l4, fullMark: 100 },
    { subject: 'L5 응용', A: scores.l5, fullMark: 100 },
  ]

  return (
    <div className="w-full h-48">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
          <PolarGrid stroke="#e2e8f0" />
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fill: '#64748b', fontSize: 10 }}
          />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            name="Ontology"
            dataKey="A"
            stroke="#1A1A1A"
            fill="#1A1A1A"
            fillOpacity={0.6}
            animationDuration={800}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
