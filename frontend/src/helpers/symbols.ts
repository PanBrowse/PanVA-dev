import type { GroupInfo } from '@/types'
import * as d3 from 'd3'

export const geneRect: d3.SymbolType =  {
    draw(context, size) {
    context.rect(0, -2, size , 2)
    }
  }

export const geneTriangleForward: d3.SymbolType =  {
    draw(context, size) {
      const sqrt3 = Math.sqrt(3)
      const x = Math.sqrt(size / (sqrt3 * 3));
      context.moveTo(x*2, 0);
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

export const getGeneSymbolType = (d: GroupInfo, currentGeneToWindow: d3.ScaleLinear<number, number, never>, barHeight: number) => {
    const geneSize = currentGeneToWindow(d.gene_end_position) - currentGeneToWindow(d.gene_start_position)
    return (geneSize > barHeight )  
    ? geneRect 
    : d.strand === '+' ? geneTriangleForward : geneTriangleReverse
  }

export const getGeneSymbolSize = (d: GroupInfo, currentGeneToWindow: d3.ScaleLinear<number, number, never>, barHeight: number) => {
    const geneSize = currentGeneToWindow(d.gene_end_position) - currentGeneToWindow(d.gene_start_position)
    return (geneSize > barHeight )  
      ? geneSize
      : barHeight * 4
}