// Palette indépendante des formes, calculée hors du rendu par tools/cup-palette.mjs
import type { VesselDefinition } from './types'

export const palette = [
  {
    id: 'oat',
    name: 'Oat',
    colors: {
      body: '#d3b787',
      inside: '#9d8254',
      rim: '#e2c595',
      border: '#b09566',
      eyes: '#1c1c1a'
    }
  },
  {
    id: 'blush',
    name: 'Blush',
    colors: {
      body: '#e9b1a9',
      inside: '#b17c75',
      rim: '#f8bfb7',
      border: '#c58f88',
      eyes: '#1c1c1a'
    }
  },
  {
    id: 'honey',
    name: 'Honey',
    colors: {
      body: '#d6ae4a',
      inside: '#9e7a0a',
      rim: '#e5bc59',
      border: '#b38c1f',
      eyes: '#1c1c1a'
    }
  },
  {
    id: 'lavender',
    name: 'Lavender',
    colors: {
      body: '#b9a6d3',
      inside: '#84729c',
      rim: '#c7b4e2',
      border: '#9785b0',
      eyes: '#1c1c1a'
    }
  },
  {
    id: 'dusty',
    name: 'Dusty blue',
    colors: {
      body: '#8cb0c8',
      inside: '#597c92',
      rim: '#9abed7',
      border: '#6b8ea5',
      eyes: '#1c1c1a'
    }
  },
  {
    id: 'sage',
    name: 'Sage',
    colors: {
      body: '#8fa16b',
      inside: '#5d6e3a',
      rim: '#9daf78',
      border: '#6f804b',
      eyes: '#fffef9'
    }
  },
  {
    id: 'stone',
    name: 'Stone',
    colors: {
      body: '#959693',
      inside: '#636461',
      rim: '#a3a4a1',
      border: '#747573',
      eyes: '#fffef9'
    }
  },
  {
    id: 'teal',
    name: 'Teal',
    colors: {
      body: '#3e8e8a',
      inside: '#095a57',
      rim: '#4d9c98',
      border: '#156d6a',
      eyes: '#fffef9'
    }
  },
  {
    id: 'terracotta',
    name: 'Terracotta',
    colors: {
      body: '#b5533c',
      inside: '#7c1e05',
      rim: '#c46149',
      border: '#91321c',
      eyes: '#fffef9'
    }
  },
  {
    id: 'deepBlue',
    name: 'Deep blue',
    colors: {
      body: '#3f5f7f',
      inside: '#11304d',
      rim: '#4b6c8d',
      border: '#22415f',
      eyes: '#fffef9'
    }
  },
  {
    id: 'cocoa',
    name: 'Cocoa',
    colors: {
      body: '#704b3a',
      inside: '#3f1e0e',
      rim: '#7d5746',
      border: '#502e1e',
      eyes: '#fffef9'
    }
  },
  {
    id: 'graphite',
    name: 'Graphite',
    colors: {
      body: '#646866',
      inside: '#363938',
      rim: '#717573',
      border: '#464a48',
      eyes: '#fffef9'
    }
  }
] as const

export const takeawayLidColors = {
  lid: '#c4c6c0',
  lidEdge: '#b9bbb5',
  lidInside: '#a4a69f'
} as const

// Le couvercle standard reste neutre ; le catalogue gris n'est jamais modifié.
export function paletteVessel(vessel: VesselDefinition, colors: Record<string, string>): VesselDefinition {
  if (vessel.id !== 'takeaway') return { ...vessel, colors: { ...colors } }
  return {
    ...vessel,
    colors: { ...colors, ...takeawayLidColors },
    parts: vessel.parts.map(part => ({
      ...part, color: part.id === 'lid' ? 'lid' : part.id === 'lid-edge' ? 'lidEdge' : part.color
    })),
    lid: vessel.lid && { ...vessel.lid, color: 'lid', insideColor: 'lidInside' }
  }
}
