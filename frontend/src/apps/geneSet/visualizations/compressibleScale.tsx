import * as d3 from "d3";

// adapted from copycat: https://github.com/EmiliaStahlbom/copycatDemo/blob/main/copycat-client/src/components/CallGraph.tsx

export const densityScale = (originalLinearScale: d3.ScaleLinear<number,number,never>, feature: number[], range: [number,number]): d3.ScaleLinear<number,number,never> => {

    const numberOfGridLines = 50;

    const originalScale = originalLinearScale.clamp(false);
    const originalPositions = feature.map(element => originalScale(element));
    const originalFeaturesRange: number[] = [d3.extent(originalPositions)[0] ?? 0, d3.extent(originalPositions)[1] ?? 10] 
    const featurePositionsRange: [number, number] = [originalFeaturesRange[0], originalFeaturesRange[1]];
    const rangeStep: number = (range[1]-range[0])/numberOfGridLines
    const originalDomain: [number, number] = [d3.extent(feature)[0] ?? 0, d3.extent(feature)[1] ?? 1] //[-2, d3.extent(callFeature)[1] ?? 1] //
    // const originalDomain: [number, number] = [originalDomain[0] - yAxisMargin, originalDomain[1] + yAxisMargin]
    const domainStep: number = (originalDomain[1] - originalDomain[0])/numberOfGridLines

    const grid: number[] = d3.range(range[0], range[1], rangeStep)
    const originalGrid: number[] = d3.range(featurePositionsRange[1], featurePositionsRange[0],-(featurePositionsRange[1]-featurePositionsRange[0])/numberOfGridLines)
    const choppedUpDomain: number[] = d3.range(originalDomain[0], originalDomain[1], domainStep)


    // calculate density along axis
    let densities: number[] = []
    const eps = 0.0001;
    originalGrid.forEach(line => {
        const density: number = d3.sum(originalPositions.map(pos => {

            return Math.abs(line-pos) < 300 ? 0.5 : Math.pow(Math.abs((line - pos)), (-1))}
        )); //Math.abs( (pos - line)) < 100 ? 100-Math.abs(pos-line) : 0));
        densities.push(density)

    })

    const cumulativeDensities: number[] = Array.from( d3.cumsum(densities))

    const newGrid = cumulativeDensities
    const scaleNewGrid = d3.scaleLinear().domain([(d3.extent(newGrid)[0] ?? 1), (d3.extent(newGrid)[1] ?? 0)]).range([range[0]-30, range[1]+30])
    const windowScaledNewGrid = newGrid.map(point => scaleNewGrid(point))
    const scaleNewRanges = d3.scaleLinear().domain(grid).range(windowScaledNewGrid)
    const newRanges = grid.map(point => scaleNewRanges(point))

    const newScale = d3.scaleLinear().domain(choppedUpDomain).range(newRanges)

    return newScale;
}

export const compressedScale = (originalLinearScale: d3.ScaleLinear<number,number,never>, feature: number[], range: [number,number]): d3.ScaleLinear<number,number,never> => {

    const numberOfGridLines = 50;

    const elementSpacing = 20;

    const newRanges = Array( feature.length).map(element => element * elementSpacing + range[0])
    newRanges[-1] = range[1]
    const newScale = d3.scaleLinear().range(newRanges).domain(feature)

    // const originalScale = originalLinearScale.clamp(false);
    // const originalPositions = feature.map(element => originalScale(element));
    // const originalFeaturesRange: number[] = [d3.extent(originalPositions)[0] ?? 0, d3.extent(originalPositions)[1] ?? 10] 
    // const featurePositionsRange: [number, number] = [originalFeaturesRange[0], originalFeaturesRange[1]];
    // const rangeStep: number = (range[1]-range[0])/numberOfGridLines
    // const originalDomain: [number, number] = [d3.extent(feature)[0] ?? 0, d3.extent(feature)[1] ?? 1] //[-2, d3.extent(callFeature)[1] ?? 1] //
    // // const originalDomain: [number, number] = [originalDomain[0] - yAxisMargin, originalDomain[1] + yAxisMargin]
    // const domainStep: number = (originalDomain[1] - originalDomain[0])/numberOfGridLines

    // const grid: number[] = d3.range(range[0], range[1], rangeStep)
    // const originalGrid: number[] = d3.range(featurePositionsRange[1], featurePositionsRange[0],-(featurePositionsRange[1]-featurePositionsRange[0])/numberOfGridLines)
    // const choppedUpDomain: number[] = d3.range(originalDomain[0], originalDomain[1], domainStep)




    // const cumulativeDensities: number[] = Array.from( d3.cumsum(densities))

    // const newGrid = cumulativeDensities
    // const scaleNewGrid = d3.scaleLinear().domain([(d3.extent(newGrid)[0] ?? 1), (d3.extent(newGrid)[1] ?? 0)]).range([range[0]-30, range[1]+30])
    // const windowScaledNewGrid = newGrid.map(point => scaleNewGrid(point))
    // const scaleNewRanges = d3.scaleLinear().domain(grid).range(windowScaledNewGrid)
    // const newRanges = grid.map(point => scaleNewRanges(point))

    // const newScale = d3.scaleLinear().domain(choppedUpDomain).range(newRanges)

    return newScale;
}