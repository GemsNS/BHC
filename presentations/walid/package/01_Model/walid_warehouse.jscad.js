'use strict'

const { booleans, colors, geometries, maths, measurements, primitives, transforms } = require('@jscad/modeling')
const { colorize, hexToRgb } = colors
const { cuboid, cylinder, polyhedron, sphere } = primitives
const { rotateX, rotateY, rotateZ, translate } = transforms

const PALETTE = {
  charcoal: hexToRgb('#30343B'),
  charcoalDark: hexToRgb('#24282E'),
  cedar: hexToRgb('#A86F3D'),
  cedarDark: hexToRgb('#80512F'),
  glass: [0.12, 0.20, 0.24, 0.78],
  black: hexToRgb('#101214'),
  doorGrey: hexToRgb('#777B7D'),
  concrete: hexToRgb('#8B8E8C'),
  terrain: hexToRgb('#66635D'),
  warmLight: [1.0, 0.64, 0.22, 1.0]
}

const mm = (value) => value / 1000

const getParameterDefinitions = () => [
  { name: 'showSite', type: 'checkbox', checked: true, caption: 'Show sloping driveway / grade (no stairs)' },
  { name: 'showAccent', type: 'checkbox', checked: true, caption: 'Show cedar-tone accent cladding' },
  { name: 'showProfile', type: 'checkbox', checked: true, caption: 'Show simplified siding ribs/boards' },
  { name: 'showLights', type: 'checkbox', checked: true, caption: 'Show conceptual exterior lights' },
  { name: 'gableWidth', type: 'float', initial: 15.42, min: 10, max: 25, step: 0.01, caption: 'Front/back gable width (m)' },
  { name: 'sideDepth', type: 'float', initial: 12.38, min: 8, max: 25, step: 0.01, caption: 'Side-wall depth (m)' },
  { name: 'lowerHeight', type: 'float', initial: 3.91, min: 2.5, max: 5.5, step: 0.01, caption: 'Lower-level height (m)' },
  { name: 'floorZone', type: 'float', initial: 0.35, min: 0.15, max: 0.75, step: 0.01, caption: 'Floor/joist zone (m)' },
  { name: 'upperWallHeight', type: 'float', initial: 2.75, min: 2.2, max: 4.5, step: 0.01, caption: 'Upper wall to eave (m)' },
  { name: 'ridgeRise', type: 'float', initial: 2.11, min: 1.0, max: 4.0, step: 0.01, caption: 'Eave-to-ridge rise (m)' },
  { name: 'roofOverhang', type: 'float', initial: 0.65, min: 0.15, max: 1.25, step: 0.01, caption: 'Roof overhang (m)' }
]

const box = (size, center, color) => colorize(color, cuboid({ size, center }))

const prismAlongY = (profile, y0, y1, color) => {
  const n = profile.length
  const points = []
  profile.forEach(([x, z]) => points.push([x, y0, z]))
  profile.forEach(([x, z]) => points.push([x, y1, z]))

  const front = []
  const back = []
  for (let i = 0; i < n; i += 1) {
    front.push(i)
    back.push(n + (n - 1 - i))
  }

  const faces = [front, back]
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n
    faces.push([i, j, n + j, n + i])
  }
  return colorize(color, polyhedron({ points, faces, orientation: 'outward' }))
}

const trimFrameY = (x, y, z, width, height, depth = 0.09, trim = 0.075) => {
  const pieces = []
  pieces.push(box([width + 2 * trim, depth, trim], [x, y, z - trim / 2], PALETTE.black))
  pieces.push(box([width + 2 * trim, depth, trim], [x, y, z + height + trim / 2], PALETTE.black))
  pieces.push(box([trim, depth, height], [x - width / 2 - trim / 2, y, z + height / 2], PALETTE.black))
  pieces.push(box([trim, depth, height], [x + width / 2 + trim / 2, y, z + height / 2], PALETTE.black))
  return pieces
}

const trimFrameX = (x, y, z, width, height, depth = 0.09, trim = 0.075) => {
  const pieces = []
  pieces.push(box([depth, width + 2 * trim, trim], [x, y, z - trim / 2], PALETTE.black))
  pieces.push(box([depth, width + 2 * trim, trim], [x, y, z + height + trim / 2], PALETTE.black))
  pieces.push(box([depth, trim, height], [x, y - width / 2 - trim / 2, z + height / 2], PALETTE.black))
  pieces.push(box([depth, trim, height], [x, y + width / 2 + trim / 2, z + height / 2], PALETTE.black))
  return pieces
}

const windowY = (x, y, z, width, height, divisionsX = 1, divisionsZ = 1) => {
  const parts = [box([width, 0.045, height], [x, y, z + height / 2], PALETTE.glass)]
  parts.push(...trimFrameY(x, y - 0.003, z, width, height, 0.075, 0.07))
  for (let i = 1; i < divisionsX; i += 1) {
    parts.push(box([0.045, 0.08, height], [x - width / 2 + i * width / divisionsX, y - 0.006, z + height / 2], PALETTE.black))
  }
  for (let i = 1; i < divisionsZ; i += 1) {
    parts.push(box([width, 0.08, 0.045], [x, y - 0.006, z + i * height / divisionsZ], PALETTE.black))
  }
  return parts
}

const windowX = (x, y, z, width, height, divisionsY = 1, divisionsZ = 1) => {
  const parts = [box([0.045, width, height], [x, y, z + height / 2], PALETTE.glass)]
  parts.push(...trimFrameX(x - 0.003, y, z, width, height, 0.075, 0.07))
  for (let i = 1; i < divisionsY; i += 1) {
    parts.push(box([0.08, 0.045, height], [x - 0.006, y - width / 2 + i * width / divisionsY, z + height / 2], PALETTE.black))
  }
  for (let i = 1; i < divisionsZ; i += 1) {
    parts.push(box([0.08, width, 0.045], [x - 0.006, y, z + i * height / divisionsZ], PALETTE.black))
  }
  return parts
}

const doorY = (x, y, z, width, height, color = PALETTE.black, glazed = false) => {
  const parts = [box([width, 0.055, height], [x, y, z + height / 2], glazed ? PALETTE.glass : color)]
  parts.push(...trimFrameY(x, y - 0.004, z, width, height, 0.09, 0.07))
  if (glazed) {
    parts.push(box([0.05, 0.095, height], [x, y - 0.008, z + height / 2], PALETTE.black))
    parts.push(box([width, 0.095, 0.05], [x, y - 0.008, z + height / 2], PALETTE.black))
  }
  return parts
}

const doorX = (x, y, z, width, height, color = PALETTE.black) => {
  const parts = [box([0.055, width, height], [x, y, z + height / 2], color)]
  parts.push(...trimFrameX(x - 0.004, y, z, width, height, 0.09, 0.07))
  return parts
}

const sectionalDoorY = (x, y, z, width, height) => {
  const parts = [box([width, 0.065, height], [x, y, z + height / 2], PALETTE.doorGrey)]
  parts.push(...trimFrameY(x, y - 0.005, z, width, height, 0.105, 0.09))
  for (let i = 1; i < 5; i += 1) {
    parts.push(box([width, 0.075, 0.025], [x, y - 0.008, z + i * height / 5], PALETTE.black))
  }
  return parts
}

const profileRibsFrontBack = (width, y, z0, z1, spacing = 0.46) => {
  const parts = []
  const count = Math.floor(width / spacing)
  for (let i = 1; i < count; i += 1) {
    const x = i * width / count
    parts.push(box([0.026, 0.026, z1 - z0], [x, y, (z0 + z1) / 2], PALETTE.charcoalDark))
  }
  return parts
}

const profileRibsSides = (depth, x, z0, z1, spacing = 0.46) => {
  const parts = []
  const count = Math.floor(depth / spacing)
  for (let i = 1; i < count; i += 1) {
    const y = i * depth / count
    parts.push(box([0.026, 0.026, z1 - z0], [x, y, (z0 + z1) / 2], PALETTE.charcoalDark))
  }
  return parts
}

const horizontalBoardsY = (x, y, z0, width, height, spacing = 0.24) => {
  const parts = []
  const count = Math.floor(height / spacing)
  for (let i = 1; i < count; i += 1) {
    parts.push(box([width, 0.026, 0.018], [x, y, z0 + i * height / count], PALETTE.cedarDark))
  }
  return parts
}

const horizontalBoardsX = (x, y, z0, width, height, spacing = 0.24) => {
  const parts = []
  const count = Math.floor(height / spacing)
  for (let i = 1; i < count; i += 1) {
    parts.push(box([0.026, width, 0.018], [x, y, z0 + i * height / count], PALETTE.cedarDark))
  }
  return parts
}

const wallLightY = (x, y, z, outward = -1) => {
  const plate = box([0.16, 0.06, 0.28], [x, y, z], PALETTE.black)
  const glow = colorize(PALETTE.warmLight, sphere({ radius: 0.07, center: [x, y + outward * 0.06, z - 0.05], segments: 16 }))
  return [plate, glow]
}

const createTerrain = (W, D, upperFloorZ) => {
  // Site-only correction: a continuous driveway descends along the left wall.
  // Keep the ramp outside a clear strip so it cannot cover the side windows or man door.
  const parts = []
  const apron = 2.4
  const yFront = -apron
  const yBack = D + apron
  const zFront = upperFloorZ + 0.12
  const zBack = 0.08

  // Upper and lower aprons remain level at the two established thresholds.
  parts.push(box([W + 2 * apron, apron, 0.22], [W / 2, yFront + apron / 2, zFront - 0.11], PALETTE.terrain))
  parts.push(box([W + 2 * apron, apron, 0.22], [W / 2, D + apron / 2, zBack - 0.11], PALETTE.terrain))

  // The sloped drive stops 0.45 m short of the side finish plane.
  const wallClear = 0.45
  const driveW = 3.5
  const xWall = -wallClear
  const xOuter = xWall - driveW
  const drive = colorize(
    hexToRgb('#5A5852'),
    polyhedron({
      points: [
        [xOuter, yFront + 0.35, zFront + 0.02],
        [xWall, yFront + 0.35, zFront + 0.02],
        [xWall, yBack - 0.20, zBack + 0.02],
        [xOuter, yBack - 0.20, zBack + 0.02],
        [xOuter, yFront + 0.35, zFront - 0.14],
        [xWall, yFront + 0.35, zFront - 0.14],
        [xWall, yBack - 0.20, zBack - 0.14],
        [xOuter, yBack - 0.20, zBack - 0.14]
      ],
      faces: [
        [0, 1, 2, 3],
        [4, 7, 6, 5],
        [0, 4, 5, 1],
        [1, 5, 6, 2],
        [2, 6, 7, 3],
        [3, 7, 4, 0]
      ],
      orientation: 'outward'
    })
  )
  parts.push(drive)

  // Level landing at the existing side man door near the garage corner; no stairs.
  parts.push(box([wallClear + 0.75, 1.55, 0.16], [-0.16, D - 0.70, zBack - 0.08], PALETTE.terrain))

  return parts
}

const main = (params) => {
  const W = params.gableWidth
  const D = params.sideDepth
  const lowerH = params.lowerHeight
  const floorZone = params.floorZone
  const upperFloorZ = lowerH + floorZone
  const eaveZ = upperFloorZ + params.upperWallHeight
  const ridgeZ = eaveZ + params.ridgeRise
  const oh = params.roofOverhang
  const wallT = 0.22
  const finishT = 0.055
  const parts = []

  // Structural massing: lower concrete level, upper framed level, and gable end triangles.
  parts.push(box([W, D, lowerH], [W / 2, D / 2, lowerH / 2], PALETTE.concrete))
  parts.push(box([W, D, floorZone], [W / 2, D / 2, lowerH + floorZone / 2], PALETTE.charcoalDark))
  parts.push(box([W, D, params.upperWallHeight], [W / 2, D / 2, upperFloorZ + params.upperWallHeight / 2], PALETTE.charcoal))
  parts.push(prismAlongY([[0, eaveZ], [W, eaveZ], [W / 2, ridgeZ]], [0][0], D, PALETTE.charcoal))

  // Thin exterior finish fields.
  parts.push(box([W, finishT, eaveZ - upperFloorZ], [W / 2, -finishT / 2, (upperFloorZ + eaveZ) / 2], PALETTE.charcoal))
  parts.push(box([W, finishT, eaveZ], [W / 2, D + finishT / 2, eaveZ / 2], PALETTE.charcoal))
  parts.push(box([finishT, D, eaveZ], [-finishT / 2, D / 2, eaveZ / 2], PALETTE.charcoal))
  parts.push(box([finishT, D, eaveZ], [W + finishT / 2, D / 2, eaveZ / 2], PALETTE.charcoal))

  // Gable roof as two colored prisms.
  const roofT = 0.14
  parts.push(prismAlongY([[-oh, eaveZ], [W / 2, ridgeZ], [W / 2, ridgeZ + roofT], [-oh, eaveZ + roofT]], -oh, D + oh, PALETTE.charcoalDark))
  parts.push(prismAlongY([[W / 2, ridgeZ], [W + oh, eaveZ], [W + oh, eaveZ + roofT], [W / 2, ridgeZ + roofT]], -oh, D + oh, PALETTE.charcoalDark))

  // Cedar-tone accent fields based on the supplied reference boards.
  if (params.showAccent) {
    // Front portal/background at upper grade.
    parts.push(box([8.85, finishT + 0.012, 2.66], [8.45, -finishT - 0.008, upperFloorZ + 1.33], PALETTE.cedar))
    parts.push(...horizontalBoardsY(8.45, -finishT - 0.016, upperFloorZ, 8.85, 2.66))

    // Projecting cedar portal around the paired entrance.
    const portalX = 5.62
    const portalW = 2.72
    const portalH = 2.82
    const beam = 0.24
    const portalY = -0.42
    parts.push(box([beam, 0.44, portalH], [portalX - portalW / 2, portalY, upperFloorZ + portalH / 2], PALETTE.cedarDark))
    parts.push(box([beam, 0.44, portalH], [portalX + portalW / 2, portalY, upperFloorZ + portalH / 2], PALETTE.cedarDark))
    parts.push(box([portalW + beam, 0.44, beam], [portalX, portalY, upperFloorZ + portalH], PALETTE.cedarDark))

    // Garage/shop façade: header band and vertical drops around door bays.
    parts.push(box([W, finishT + 0.012, 1.78], [W / 2, D + finishT + 0.008, 3.32], PALETTE.cedar))
    parts.push(...horizontalBoardsY(W / 2, D + finishT + 0.016, 2.43, W, 1.78))
    ;[1.9, 5.65, 10.0, 14.1].forEach((x) => {
      parts.push(box([0.44, finishT + 0.012, 2.48], [x, D + finishT + 0.008, 1.24], PALETTE.cedar))
    })

    // Side elevations: lower cedar field and continuous belt at the floor transition.
    parts.push(box([finishT + 0.012, D, lowerH], [-finishT - 0.008, D / 2, lowerH / 2], PALETTE.cedar))
    parts.push(box([finishT + 0.012, D, lowerH], [W + finishT + 0.008, D / 2, lowerH / 2], PALETTE.cedar))
    parts.push(box([finishT + 0.018, D, 0.70], [-finishT - 0.012, D / 2, upperFloorZ], PALETTE.cedar))
    parts.push(box([finishT + 0.018, D, 0.70], [W + finishT + 0.012, D / 2, upperFloorZ], PALETTE.cedar))
    parts.push(...horizontalBoardsX(-finishT - 0.020, D / 2, 0, D, lowerH))
    parts.push(...horizontalBoardsX(W + finishT + 0.020, D / 2, 0, D, lowerH))
  }

  // Principal front/upper-grade openings.
  parts.push(...windowY(2.20, -0.10, upperFloorZ + 0.90, 1.22, 1.22, 1, 2))
  parts.push(...doorY(5.62, -0.12, upperFloorZ + 0.08, 1.83, 2.03, PALETTE.black, true))
  parts.push(...sectionalDoorY(10.28, -0.12, upperFloorZ + 0.05, 3.73, 2.44))
  parts.push(...windowY(13.55, -0.10, upperFloorZ + 0.90, 1.22, 1.22, 1, 2))

  // Lower shop/garage façade openings.
  // As-built: man door is on the left sidewall near this corner — not on the garage wall.
  parts.push(...sectionalDoorY(3.35, D + 0.12, 0.05, 2.74, 2.44))
  parts.push(...sectionalDoorY(8.00, D + 0.12, 0.05, 3.73, 2.44))
  parts.push(...sectionalDoorY(12.68, D + 0.12, 0.05, 2.74, 2.44))
  parts.push(...windowY(3.35, D + 0.10, upperFloorZ + 0.94, 1.42, 0.57, 2, 1))
  parts.push(...windowY(12.68, D + 0.10, upperFloorZ + 0.94, 1.42, 0.57, 2, 1))

  // Left side openings.
  // Man door at lower grade near the garage/back corner (matches site photo).
  parts.push(...doorX(-0.11, D - 0.70, 0.05, 0.91, 2.03))
  parts.push(...windowX(-0.10, 5.20, 2.20, 1.42, 0.57, 2, 1))
  parts.push(...windowX(-0.10, 7.55, 2.20, 1.42, 0.57, 2, 1))
  parts.push(...windowX(-0.10, 1.55, upperFloorZ + 0.82, 0.91, 1.52, 1, 2))
  parts.push(...windowX(-0.10, D / 2, upperFloorZ + 0.96, 1.22, 1.22, 1, 2))
  parts.push(...windowX(-0.10, D - 2.35, upperFloorZ + 0.82, 0.91, 1.52, 1, 2))

  // Right side openings.
  parts.push(...windowX(W + 0.10, 5.10, 2.20, 1.42, 0.57, 2, 1))
  parts.push(...windowX(W + 0.10, 7.40, 2.20, 1.42, 0.57, 2, 1))
  parts.push(...windowX(W + 0.10, 1.55, upperFloorZ + 0.82, 0.91, 1.52, 1, 2))
  parts.push(...windowX(W + 0.10, D - 1.55, upperFloorZ + 0.82, 0.91, 1.52, 1, 2))

  if (params.showProfile) {
    parts.push(...profileRibsFrontBack(W, -0.088, upperFloorZ, eaveZ))
    parts.push(...profileRibsFrontBack(W, D + 0.088, upperFloorZ + 1.72, eaveZ))
    parts.push(...profileRibsSides(D, -0.088, upperFloorZ + 0.35, eaveZ))
    parts.push(...profileRibsSides(D, W + 0.088, upperFloorZ + 0.35, eaveZ))
  }

  if (params.showLights) {
    ;[4.10, 7.25, 9.35, 12.55].forEach((x) => parts.push(...wallLightY(x, -0.16, eaveZ - 0.48, -1)))
    ;[2.10, 5.80, 10.20, 13.70].forEach((x) => parts.push(...wallLightY(x, D + 0.16, 3.83, 1)))
  }

  if (params.showSite) {
    parts.push(...createTerrain(W, D, upperFloorZ))
  }

  return parts
}

module.exports = { getParameterDefinitions, main }
