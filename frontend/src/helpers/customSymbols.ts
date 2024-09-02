import { min, sqrt } from '@/helpers/math'
import type { GroupInfo } from '@/types'

export const plus = {
  draw(context, size) {
    const r = sqrt(size - min(size / 7, 2)) * 0.87559
    context.moveTo(-r, 0)
    context.lineTo(r, 0)
    context.moveTo(0, r)
    context.lineTo(0, -r)
  },
}

export const cross = {
  draw(context, size) {
    const r = sqrt(size / 5) / 2
    context.moveTo(-3 * r, -r)
    context.lineTo(-r, -r)
    context.lineTo(-r, -3 * r)
    context.lineTo(r, -3 * r)
    context.lineTo(r, -r)
    context.lineTo(3 * r, -r)
    context.lineTo(3 * r, r)
    context.lineTo(r, r)
    context.lineTo(r, 3 * r)
    context.lineTo(-r, 3 * r)
    context.lineTo(-r, r)
    context.lineTo(-3 * r, r)
    context.closePath()
  },
}
const sqrt3 = sqrt(3)

export const asterisk = {
  draw(context, size) {
    const r = sqrt(size + min(size / 28, 0.75)) * 0.59436
    const t = r / 2
    const u = t * sqrt3
    context.moveTo(0, r)
    context.lineTo(0, -r)
    context.moveTo(-u, -t)
    context.lineTo(u, t)
    context.moveTo(-u, t)
    context.lineTo(u, -t)
  },
}

export const geneRect: d3.SymbolType =  {
  draw(context, size) {
    context.moveTo(-size/2,0)
    context.rect(-size/2, -1, size , 2)
  }
}

export const geneTriangleForward: d3.SymbolType =  {
  draw(context, size) {
    const sqrt3 = Math.sqrt(3)
    const x = Math.sqrt(size / (sqrt3 * 3));
    context.moveTo(2*x, 0);
    context.lineTo(-x, -sqrt3 * x);
    context.lineTo(-x, sqrt3 * x);
    context.closePath();
  }
}
export  const geneTriangleReverse: d3.SymbolType =  {
  draw(context, size) {
    const sqrt3 = Math.sqrt(3)
    const x = Math.sqrt(size / (sqrt3 * 3));
    context.moveTo(-x*2, 0);
    context.lineTo(x, -sqrt3 * x);
    context.lineTo(x, sqrt3 * x);
    context.closePath();
  }
}

export const geneTriangleRectForward: d3.SymbolType = {
  draw(context, size) {
    const sqrt3 = Math.sqrt(3)
    const geneHeight = 2
    const triangleSize = geneHeight * 8
    const x = Math.sqrt(triangleSize / (sqrt3 * 3));

    context.moveTo(-size/2, -geneHeight/2);
    context.lineTo(size/2, -geneHeight/2 )
    // add small tick
    // context.lineTo(size/2, -geneHeight/2 - 2)
    // context.lineTo(size/2-0.5, -geneHeight/2 - 2)

    context.lineTo(size/2, -geneHeight/2 )
    context.lineTo(size/2 + x, 0)
    context.lineTo(size/2, geneHeight/2)
    context.lineTo(-size/2, geneHeight/2)
    
    context.lineTo(-size/2 , -geneHeight/2)
    context.closePath();
  }
}

export const geneTriangleRectReverse: d3.SymbolType = {
  draw(context, size) {
    const sqrt3 = Math.sqrt(3)
    const geneHeight = 2
    const triangleSize = geneHeight * 8
    const x = Math.sqrt(triangleSize / (sqrt3 * 3));

    context.moveTo(-size/2, -geneHeight/2);
    context.lineTo(size/2, -geneHeight/2 )
    context.lineTo(size/2, geneHeight/2)
    context.lineTo(-size/2, geneHeight/2)
    context.lineTo(-size/2 - x, 0)
    context.lineTo(-size/2 , -geneHeight/2)
    // add small tick 
    // context.lineTo(-size/2 , -geneHeight/2-2)
    // context.lineTo(-size/2 + 0.5, -geneHeight/2-2)

    context.lineTo(-size/2 , -geneHeight/2)
    context.closePath();
  }
}

export const getGeneSymbolType = (d: GroupInfo, currentGeneToWindow: d3.ScaleLinear<number, number, never>, barHeight: number, showBars: boolean = true) => {
  const geneSize = currentGeneToWindow(d.mRNA_end_position) - currentGeneToWindow(d.mRNA_start_position)
  return (geneSize > barHeight && showBars)  
  ? d.strand === '+' ? geneTriangleRectForward : geneTriangleRectReverse
  : d.strand === '+' ? geneTriangleForward : geneTriangleReverse
}

export const getGeneSymbolSize = (d: GroupInfo, currentGeneToWindow: d3.ScaleLinear<number, number, never>, barHeight: number, showBars:boolean = true) => {
  const geneSize = currentGeneToWindow(d.mRNA_end_position) - currentGeneToWindow(d.mRNA_start_position) 
  return ((geneSize > barHeight) && showBars)  
    ? geneSize
    : barHeight * 4
}