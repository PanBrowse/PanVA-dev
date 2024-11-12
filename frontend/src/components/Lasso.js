'use strict'
import { drag, pointer } from 'd3'

const exports = {}

function createCommonjsModule(fn, module) {
  return (module = { exports: {} }), fn(module, module.exports), module.exports
}

const twoProduct_1 = twoProduct

const SPLITTER = +(Math.pow(2, 27) + 1.0)

function twoProduct(a, b, result) {
  const x = a * b

  const c = SPLITTER * a
  const abig = c - a
  const ahi = c - abig
  const alo = a - ahi

  const d = SPLITTER * b
  const bbig = d - b
  const bhi = d - bbig
  const blo = b - bhi

  const err1 = x - ahi * bhi
  const err2 = err1 - alo * bhi
  const err3 = err2 - ahi * blo

  const y = alo * blo - err3

  if (result) {
    result[0] = y
    result[1] = x
    return result
  }

  return [y, x]
}

const robustSum = linearExpansionSum

//Easy case: Add two scalars
function scalarScalar(a, b) {
  const x = a + b
  const bv = x - a
  const av = x - bv
  const br = b - bv
  const ar = a - av
  const y = ar + br
  if (y) {
    return [y, x]
  }
  return [x]
}

function linearExpansionSum(e, f) {
  const ne = e.length | 0
  const nf = f.length | 0
  if (ne === 1 && nf === 1) {
    return scalarScalar(e[0], f[0])
  }
  const n = ne + nf
  const g = new Array(n)
  let count = 0
  let eptr = 0
  let fptr = 0
  const abs = Math.abs
  let ei = e[eptr]
  let ea = abs(ei)
  let fi = f[fptr]
  let fa = abs(fi)
  let a, b
  if (ea < fa) {
    b = ei
    eptr += 1
    if (eptr < ne) {
      ei = e[eptr]
      ea = abs(ei)
    }
  } else {
    b = fi
    fptr += 1
    if (fptr < nf) {
      fi = f[fptr]
      fa = abs(fi)
    }
  }
  if ((eptr < ne && ea < fa) || fptr >= nf) {
    a = ei
    eptr += 1
    if (eptr < ne) {
      ei = e[eptr]
      ea = abs(ei)
    }
  } else {
    a = fi
    fptr += 1
    if (fptr < nf) {
      fi = f[fptr]
      fa = abs(fi)
    }
  }
  let x = a + b
  let bv = x - a
  let y = b - bv
  let q0 = y
  let q1 = x
  let _x, _bv, _av, _br, _ar
  while (eptr < ne && fptr < nf) {
    if (ea < fa) {
      a = ei
      eptr += 1
      if (eptr < ne) {
        ei = e[eptr]
        ea = abs(ei)
      }
    } else {
      a = fi
      fptr += 1
      if (fptr < nf) {
        fi = f[fptr]
        fa = abs(fi)
      }
    }
    b = q0
    x = a + b
    bv = x - a
    y = b - bv
    if (y) {
      g[count++] = y
    }
    _x = q1 + x
    _bv = _x - q1
    _av = _x - _bv
    _br = x - _bv
    _ar = q1 - _av
    q0 = _ar + _br
    q1 = _x
  }
  while (eptr < ne) {
    a = ei
    b = q0
    x = a + b
    bv = x - a
    y = b - bv
    if (y) {
      g[count++] = y
    }
    _x = q1 + x
    _bv = _x - q1
    _av = _x - _bv
    _br = x - _bv
    _ar = q1 - _av
    q0 = _ar + _br
    q1 = _x
    eptr += 1
    if (eptr < ne) {
      ei = e[eptr]
    }
  }
  while (fptr < nf) {
    a = fi
    b = q0
    x = a + b
    bv = x - a
    y = b - bv
    if (y) {
      g[count++] = y
    }
    _x = q1 + x
    _bv = _x - q1
    _av = _x - _bv
    _br = x - _bv
    _ar = q1 - _av
    q0 = _ar + _br
    q1 = _x
    fptr += 1
    if (fptr < nf) {
      fi = f[fptr]
    }
  }
  if (q0) {
    g[count++] = q0
  }
  if (q1) {
    g[count++] = q1
  }
  if (!count) {
    g[count++] = 0.0
  }
  g.length = count
  return g
}

const twoSum = fastTwoSum

function fastTwoSum(a, b, result) {
  const x = a + b
  const bv = x - a
  const av = x - bv
  const br = b - bv
  const ar = a - av
  if (result) {
    result[0] = ar + br
    result[1] = x
    return result
  }
  return [ar + br, x]
}

const robustScale = scaleLinearExpansion

function scaleLinearExpansion(e, scale) {
  const n = e.length
  if (n === 1) {
    const ts = twoProduct_1(e[0], scale)
    if (ts[0]) {
      return ts
    }
    return [ts[1]]
  }
  const g = new Array(2 * n)
  const q = [0.1, 0.1]
  const t = [0.1, 0.1]
  let count = 0
  twoProduct_1(e[0], scale, q)
  if (q[0]) {
    g[count++] = q[0]
  }
  for (let i = 1; i < n; ++i) {
    twoProduct_1(e[i], scale, t)
    const pq = q[1]
    twoSum(pq, t[0], q)
    if (q[0]) {
      g[count++] = q[0]
    }
    const a = t[1]
    const b = q[1]
    const x = a + b
    const bv = x - a
    const y = b - bv
    q[1] = x
    if (y) {
      g[count++] = y
    }
  }
  if (q[1]) {
    g[count++] = q[1]
  }
  if (count === 0) {
    g[count++] = 0.0
  }
  g.length = count
  return g
}

const robustDiff = robustSubtract

//Easy case: Add two scalars
function scalarScalar$1(a, b) {
  const x = a + b
  const bv = x - a
  const av = x - bv
  const br = b - bv
  const ar = a - av
  const y = ar + br
  if (y) {
    return [y, x]
  }
  return [x]
}

function robustSubtract(e, f) {
  const ne = e.length | 0
  const nf = f.length | 0
  if (ne === 1 && nf === 1) {
    return scalarScalar$1(e[0], -f[0])
  }
  const n = ne + nf
  const g = new Array(n)
  let count = 0
  let eptr = 0
  let fptr = 0
  const abs = Math.abs
  let ei = e[eptr]
  let ea = abs(ei)
  let fi = -f[fptr]
  let fa = abs(fi)
  let a, b
  if (ea < fa) {
    b = ei
    eptr += 1
    if (eptr < ne) {
      ei = e[eptr]
      ea = abs(ei)
    }
  } else {
    b = fi
    fptr += 1
    if (fptr < nf) {
      fi = -f[fptr]
      fa = abs(fi)
    }
  }
  if ((eptr < ne && ea < fa) || fptr >= nf) {
    a = ei
    eptr += 1
    if (eptr < ne) {
      ei = e[eptr]
      ea = abs(ei)
    }
  } else {
    a = fi
    fptr += 1
    if (fptr < nf) {
      fi = -f[fptr]
      fa = abs(fi)
    }
  }
  let x = a + b
  let bv = x - a
  let y = b - bv
  let q0 = y
  let q1 = x
  let _x, _bv, _av, _br, _ar
  while (eptr < ne && fptr < nf) {
    if (ea < fa) {
      a = ei
      eptr += 1
      if (eptr < ne) {
        ei = e[eptr]
        ea = abs(ei)
      }
    } else {
      a = fi
      fptr += 1
      if (fptr < nf) {
        fi = -f[fptr]
        fa = abs(fi)
      }
    }
    b = q0
    x = a + b
    bv = x - a
    y = b - bv
    if (y) {
      g[count++] = y
    }
    _x = q1 + x
    _bv = _x - q1
    _av = _x - _bv
    _br = x - _bv
    _ar = q1 - _av
    q0 = _ar + _br
    q1 = _x
  }
  while (eptr < ne) {
    a = ei
    b = q0
    x = a + b
    bv = x - a
    y = b - bv
    if (y) {
      g[count++] = y
    }
    _x = q1 + x
    _bv = _x - q1
    _av = _x - _bv
    _br = x - _bv
    _ar = q1 - _av
    q0 = _ar + _br
    q1 = _x
    eptr += 1
    if (eptr < ne) {
      ei = e[eptr]
    }
  }
  while (fptr < nf) {
    a = fi
    b = q0
    x = a + b
    bv = x - a
    y = b - bv
    if (y) {
      g[count++] = y
    }
    _x = q1 + x
    _bv = _x - q1
    _av = _x - _bv
    _br = x - _bv
    _ar = q1 - _av
    q0 = _ar + _br
    q1 = _x
    fptr += 1
    if (fptr < nf) {
      fi = -f[fptr]
    }
  }
  if (q0) {
    g[count++] = q0
  }
  if (q1) {
    g[count++] = q1
  }
  if (!count) {
    g[count++] = 0.0
  }
  g.length = count
  return g
}

const orientation_1 = createCommonjsModule(function (module) {
  const NUM_EXPAND = 5

  const EPSILON = 1.1102230246251565e-16
  const ERRBOUND3 = (3.0 + 16.0 * EPSILON) * EPSILON
  const ERRBOUND4 = (7.0 + 56.0 * EPSILON) * EPSILON

  function cofactor(m, c) {
    const result = new Array(m.length - 1)
    for (let i = 1; i < m.length; ++i) {
      const r = (result[i - 1] = new Array(m.length - 1))
      for (let j = 0, k = 0; j < m.length; ++j) {
        if (j === c) {
          continue
        }
        r[k++] = m[i][j]
      }
    }
    return result
  }

  function matrix(n) {
    const result = new Array(n)
    for (let i = 0; i < n; ++i) {
      result[i] = new Array(n)
      for (let j = 0; j < n; ++j) {
        result[i][j] = ['m', j, '[', n - i - 1, ']'].join('')
      }
    }
    return result
  }

  function sign(n) {
    if (n & 1) {
      return '-'
    }
    return ''
  }

  function generateSum(expr) {
    if (expr.length === 1) {
      return expr[0]
    } else if (expr.length === 2) {
      return ['sum(', expr[0], ',', expr[1], ')'].join('')
    } else {
      const m = expr.length >> 1
      return [
        'sum(',
        generateSum(expr.slice(0, m)),
        ',',
        generateSum(expr.slice(m)),
        ')',
      ].join('')
    }
  }

  function determinant(m) {
    if (m.length === 2) {
      return [
        [
          'sum(prod(',
          m[0][0],
          ',',
          m[1][1],
          '),prod(-',
          m[0][1],
          ',',
          m[1][0],
          '))',
        ].join(''),
      ]
    } else {
      const expr = []
      for (let i = 0; i < m.length; ++i) {
        expr.push(
          [
            'scale(',
            generateSum(determinant(cofactor(m, i))),
            ',',
            sign(i),
            m[0][i],
            ')',
          ].join('')
        )
      }
      return expr
    }
  }

  function orientation(n) {
    const pos = []
    const neg = []
    const m = matrix(n)
    const args = []
    for (let i = 0; i < n; ++i) {
      if ((i & 1) === 0) {
        pos.push.apply(pos, determinant(cofactor(m, i)))
      } else {
        neg.push.apply(neg, determinant(cofactor(m, i)))
      }
      args.push('m' + i)
    }
    const posExpr = generateSum(pos)
    const negExpr = generateSum(neg)
    const funcName = 'orientation' + n + 'Exact'
    const code = [
      'function ',
      funcName,
      '(',
      args.join(),
      '){var p=',
      posExpr,
      ',n=',
      negExpr,
      ',d=sub(p,n);\
return d[d.length-1];};return ',
      funcName,
    ].join('')
    const proc = new Function('sum', 'prod', 'scale', 'sub', code)
    return proc(robustSum, twoProduct_1, robustScale, robustDiff)
  }

  const orientation3Exact = orientation(3)
  const orientation4Exact = orientation(4)

  const CACHED = [
    function orientation0() {
      return 0
    },
    function orientation1() {
      return 0
    },
    function orientation2(a, b) {
      return b[0] - a[0]
    },
    function orientation3(a, b, c) {
      const l = (a[1] - c[1]) * (b[0] - c[0])
      const r = (a[0] - c[0]) * (b[1] - c[1])
      const det = l - r
      let s
      if (l > 0) {
        if (r <= 0) {
          return det
        } else {
          s = l + r
        }
      } else if (l < 0) {
        if (r >= 0) {
          return det
        } else {
          s = -(l + r)
        }
      } else {
        return det
      }
      const tol = ERRBOUND3 * s
      if (det >= tol || det <= -tol) {
        return det
      }
      return orientation3Exact(a, b, c)
    },
    function orientation4(a, b, c, d) {
      const adx = a[0] - d[0]
      const bdx = b[0] - d[0]
      const cdx = c[0] - d[0]
      const ady = a[1] - d[1]
      const bdy = b[1] - d[1]
      const cdy = c[1] - d[1]
      const adz = a[2] - d[2]
      const bdz = b[2] - d[2]
      const cdz = c[2] - d[2]
      const bdxcdy = bdx * cdy
      const cdxbdy = cdx * bdy
      const cdxady = cdx * ady
      const adxcdy = adx * cdy
      const adxbdy = adx * bdy
      const bdxady = bdx * ady
      const det =
        adz * (bdxcdy - cdxbdy) +
        bdz * (cdxady - adxcdy) +
        cdz * (adxbdy - bdxady)
      const permanent =
        (Math.abs(bdxcdy) + Math.abs(cdxbdy)) * Math.abs(adz) +
        (Math.abs(cdxady) + Math.abs(adxcdy)) * Math.abs(bdz) +
        (Math.abs(adxbdy) + Math.abs(bdxady)) * Math.abs(cdz)
      const tol = ERRBOUND4 * permanent
      if (det > tol || -det > tol) {
        return det
      }
      return orientation4Exact(a, b, c, d)
    },
  ]

  function slowOrient(args) {
    let proc = CACHED[args.length]
    if (!proc) {
      proc = CACHED[args.length] = orientation(args.length)
    }
    return proc.apply(undefined, args)
  }

  function generateOrientationProc() {
    while (CACHED.length <= NUM_EXPAND) {
      CACHED.push(orientation(CACHED.length))
    }
    const args = []
    const procArgs = ['slow']
    for (var i = 0; i <= NUM_EXPAND; ++i) {
      args.push('a' + i)
      procArgs.push('o' + i)
    }
    const code = [
      'function getOrientation(',
      args.join(),
      '){switch(arguments.length){case 0:case 1:return 0;',
    ]
    for (var i = 2; i <= NUM_EXPAND; ++i) {
      code.push('case ', i, ':return o', i, '(', args.slice(0, i).join(), ');')
    }
    code.push(
      '}var s=new Array(arguments.length);for(var i=0;i<arguments.length;++i){s[i]=arguments[i]};return slow(s);}return getOrientation'
    )
    procArgs.push(code.join(''))

    const proc = Function.apply(undefined, procArgs)
    module.exports = proc.apply(undefined, [slowOrient].concat(CACHED))
    for (var i = 0; i <= NUM_EXPAND; ++i) {
      module.exports[i] = CACHED[i]
    }
  }

  generateOrientationProc()
})

const robustPnp = robustPointInPolygon

function robustPointInPolygon(vs, point) {
  const x = point[0]
  const y = point[1]
  const n = vs.length
  let inside = 1
  let lim = n
  for (let i = 0, j = n - 1; i < lim; j = i++) {
    const a = vs[i]
    const b = vs[j]
    const yi = a[1]
    const yj = b[1]
    if (yj < yi) {
      if (yj < y && y < yi) {
        var s = orientation_1(a, b, point)
        if (s === 0) {
          return 0
        } else {
          inside ^= (0 < s) | 0
        }
      } else if (y === yi) {
        var c = vs[(i + 1) % n]
        var yk = c[1]
        if (yi < yk) {
          var s = orientation_1(a, b, point)
          if (s === 0) {
            return 0
          } else {
            inside ^= (0 < s) | 0
          }
        }
      }
    } else if (yi < yj) {
      if (yi < y && y < yj) {
        var s = orientation_1(a, b, point)
        if (s === 0) {
          return 0
        } else {
          inside ^= (s < 0) | 0
        }
      } else if (y === yi) {
        var c = vs[(i + 1) % n]
        var yk = c[1]
        if (yk < yi) {
          var s = orientation_1(a, b, point)
          if (s === 0) {
            return 0
          } else {
            inside ^= (s < 0) | 0
          }
        }
      }
    } else if (y === yi) {
      let x0 = Math.min(a[0], b[0])
      let x1 = Math.max(a[0], b[0])
      if (i === 0) {
        while (j > 0) {
          const k = (j + n - 1) % n
          var p = vs[k]
          if (p[1] !== y) {
            break
          }
          var px = p[0]
          x0 = Math.min(x0, px)
          x1 = Math.max(x1, px)
          j = k
        }
        if (j === 0) {
          if (x0 <= x && x <= x1) {
            return 0
          }
          return 1
        }
        lim = j + 1
      }
      const y0 = vs[(j + n - 1) % n][1]
      while (i + 1 < lim) {
        var p = vs[i + 1]
        if (p[1] !== y) {
          break
        }
        var px = p[0]
        x0 = Math.min(x0, px)
        x1 = Math.max(x1, px)
        i += 1
      }
      if (x0 <= x && x <= x1) {
        return 0
      }
      const y1 = vs[(i + 1) % n][1]
      if (x < x0 && y0 < y !== y1 < y) {
        inside ^= 1
      }
    }
  }
  return 2 * inside - 1
}

export function lasso() {
  let items = [],
    closePathDistance = 75,
    closePathSelect = true,
    isPathClosed = false,
    hoverSelect = true,
    targetArea,
    on = { start: function () {}, draw: function () {}, end: function () {} }

  // Function to execute on call
  function lasso(_this) {
    // add a new group for the lasso
    const g = _this.append('g').attr('class', 'lasso')

    // add the drawn path for the lasso
    const dyn_path = g.append('path').attr('class', 'drawn')

    // add a closed path
    const close_path = g.append('path').attr('class', 'loop_close')

    // add an origin node
    const origin_node = g.append('circle').attr('class', 'origin')

    // The transformed lasso path for rendering
    let tpath

    // The lasso origin for calculations
    let origin

    // The transformed lasso origin for rendering
    let torigin

    // Store off coordinates drawn
    let drawnCoords

    // Apply drag behaviors
    const dragAction = drag()
      .filter((x) => true) // CUSTOM: enable right-click
      .on('start', dragstart)
      .on('drag', dragmove)
      .on('end', dragend)

    // Call drag
    targetArea.call(dragAction)
    _this.dragstart = dragstart
    _this.dragmove = dragmove
    _this.dragend = dragend

    function dragstart(event) {
      // Init coordinates
      drawnCoords = []

      // Initialize paths
      tpath = ''
      dyn_path.attr('d', null)
      close_path.attr('d', null)

      // Set every item to have a false selection and reset their center point and counters
      items.forEach(function (e) {
        e.__lasso.possible = false
        e.__lasso.selected = false
        e.__lasso.hoverSelect = false
        e.__lasso.loopSelect = false

        const box = e.getBoundingClientRect()
        e.__lasso.lassoPoint = [
          Math.round(box.left + box.width / 2),
          Math.round(box.top + box.height / 2),
        ]
      })

      // if hover is on, add hover function
      if (hoverSelect) {
        // CUSTOM:  Disabled this, items passed is a direct list, on does not exist.
        // items.on('mouseover.lasso', function () {
        //   // if hovered, change lasso selection attribute to true
        //   this.__lasso.hoverSelect = true
        // })
      }

      // Run user defined start function
      on.start(event.sourceEvent)
    }

    function dragmove(event) {
      // Get mouse position within body, used for calculations
      let x, y
      if (event.sourceEvent.type === 'touchmove') {
        x = event.sourceEvent.touches[0].clientX
        y = event.sourceEvent.touches[0].clientY
      } else {
        x = event.sourceEvent.clientX
        y = event.sourceEvent.clientY
      }

      // Get mouse position within drawing area, used for rendering
      const [tx, ty] = pointer(event, this)

      // Initialize the path or add the latest point to it
      if (tpath === '') {
        tpath = tpath + 'M ' + tx + ' ' + ty
        origin = [x, y]
        torigin = [tx, ty]
        // Draw origin node
        origin_node
          .attr('cx', tx)
          .attr('cy', ty)
          .attr('r', 7)
          .attr('display', null)
      } else {
        tpath = tpath + ' L ' + tx + ' ' + ty
      }

      drawnCoords.push([tx, ty])

      // Calculate the current distance from the lasso origin
      const distance = Math.sqrt(
        Math.pow(x - origin[0], 2) + Math.pow(y - origin[1], 2)
      )

      // Set the closed path line
      const close_draw_path =
        'M ' + tx + ' ' + ty + ' L ' + torigin[0] + ' ' + torigin[1]

      // Draw the lines
      dyn_path.attr('d', tpath)

      close_path.attr('d', close_draw_path)

      // Check if the path is closed
      isPathClosed = distance <= closePathDistance ? true : false

      // If within the closed path distance parameter, show the closed path. otherwise, hide it
      if (isPathClosed && closePathSelect) {
        close_path.attr('display', null)
      } else {
        close_path.attr('display', 'none')
      }

      items.forEach(function (n) {
        n.__lasso.loopSelect =
          isPathClosed && closePathSelect
            ? robustPnp(drawnCoords, n.__lasso.lassoPoint) < 1
            : false
        n.__lasso.possible = n.__lasso.hoverSelect || n.__lasso.loopSelect
      })

      on.draw(event.sourceEvent)
    }

    function dragend(event) {
      // Remove mouseover tagging function
      // CUSTOM: disabled
      //items.on('mouseover.lasso', null)

      items.forEach(function (n) {
        n.__lasso.selected = n.__lasso.possible
        n.__lasso.possible = false
      })

      // Clear lasso
      // Commenting out the lines that clear the path
      // dyn_path.attr('d', null)
      // close_path.attr('d', null)
      // origin_node.attr('display', 'none')

      // dyn_path.attr('d', null);
      // close_path.attr('d', null);

      // Optionally, if you want to clear the path later,
      // you can set a timeout to clear the path after a delay.
      // setTimeout(() => {
      //   dyn_path.attr('d', null) // Clear the lasso path after a delay if needed
      //   close_path.attr('d', null) // Clear the close path after a delay if needed
      // }, 1000) // Adjust the delay as needed (e.g., 2000 ms = 2 seconds)

      // // Hide the origin node
      // origin_node.attr('display', 'none')

      // Run user defined end function
      on.end(event.sourceEvent)
    }
  }

  // Set or get list of items for lasso to select
  lasso.items = function (_) {
    if (!arguments.length) return items
    items = _
    items.forEach(function (n) {
      n.__lasso = {
        possible: false,
        selected: false,
      }
    })
    return lasso
  }

  // Return possible items
  lasso.possibleItems = function () {
    return items.filter(function () {
      return this.__lasso.possible
    })
  }

  // Return selected items
  lasso.selectedItems = function () {
    return items.filter(function () {
      return this.__lasso.selected
    })
  }

  // Return not possible items
  lasso.notPossibleItems = function () {
    return items.filter(function () {
      return !this.__lasso.possible
    })
  }

  // Return not selected items
  lasso.notSelectedItems = function () {
    return items.filter(function () {
      return !this.__lasso.selected
    })
  }

  // Distance required before path auto closes loop
  lasso.closePathDistance = function (_) {
    if (!arguments.length) return closePathDistance
    closePathDistance = _
    return lasso
  }

  // Option to loop select or not
  lasso.closePathSelect = function (_) {
    if (!arguments.length) return closePathSelect
    closePathSelect = _ === true ? true : false
    return lasso
  }

  // Not sure what this is for
  lasso.isPathClosed = function (_) {
    if (!arguments.length) return isPathClosed
    isPathClosed = _ === true ? true : false
    return lasso
  }

  // Option to select on hover or not
  lasso.hoverSelect = function (_) {
    if (!arguments.length) return hoverSelect
    hoverSelect = _ === true ? true : false
    return lasso
  }

  // Events
  lasso.on = function (type, _) {
    if (!arguments.length) return on
    if (arguments.length === 1) return on[type]
    const types = ['start', 'draw', 'end']
    if (types.indexOf(type) > -1) {
      on[type] = _
    }
    return lasso
  }

  // Area where lasso can be triggered from
  lasso.targetArea = function (_) {
    if (!arguments.length) return targetArea
    targetArea = _
    return lasso
  }

  return lasso
}

exports.lasso = lasso

Object.defineProperty(exports, '__esModule', { value: true })
