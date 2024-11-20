import type { Dictionary } from 'lodash'

import type { GroupInfo, Sequence, SequenceMetrics } from '@/types'
import type { Gene, GenomeData, SequenceInfo } from '@/types'

///// new helpers for genomeData
export function getSequenceIdByUid(
  sequences: SequenceInfo[],
  uid: string
): string | undefined {
  const sequence = sequences.find((seq) => seq.uid === uid)
  return sequence ? sequence.id : undefined
}

export const createSequenceToLociGenesLookup = (
  genomeData: GenomeData
): Map<string, { loci: string[]; genes: string[] }> => {
  const sequenceToLociGenes = new Map<
    string,
    { loci: string[]; genes: string[] }
  >()

  genomeData.sequences.forEach((sequence) => {
    // Get loci associated with this sequence
    const lociUids = genomeData.loci
      .filter((locus) => sequence.loci.includes(locus.uid))
      .map((locus) => locus.uid)

    // Get all genes associated with these loci
    const genes = genomeData.loci
      .filter((locus) => lociUids.includes(locus.uid))
      .flatMap((locus) => locus.genes)

    sequenceToLociGenes.set(sequence.uid, { loci: lociUids, genes })
  })

  return sequenceToLociGenes
}

export const createGeneToLociAndSequenceLookup = (
  genomeData: GenomeData
): Map<string, { loci: string; sequence: string }> => {
  const geneToLociAndSequence = new Map<
    string,
    { loci: string; sequence: string }
  >()

  // Loop through each sequence in genomeData
  genomeData.sequences.forEach((sequence) => {
    sequence.loci.forEach((locusUid) => {
      // Find the corresponding locus by UID
      const locus = genomeData.loci.find((l) => l.uid === locusUid)

      if (locus) {
        // Map each gene within this locus to its locus and sequence UID
        locus.genes.forEach((geneUid) => {
          geneToLociAndSequence.set(geneUid, {
            loci: locus.uid,
            sequence: sequence.uid,
          })
        })
      } else {
        console.warn(`Locus with UID ${locusUid} not found in genomeData.loci`)
      }
    })
  })

  console.log('geneToLociAndSequence Map:', geneToLociAndSequence)
  return geneToLociAndSequence
}

export const chromosomesLookup = (sequences: SequenceMetrics[]) => {
  /**
   * Returns all sequences per chromosome
   */
  const lookup: Dictionary<SequenceMetrics[]> = {}
  sequences.forEach((sequence) => {
    const key = sequence.phasing_chromosome
    const rows = lookup[key] || []
    rows.push(sequence)
    lookup[key] = rows
  })
  return lookup
}

export const groupInfosLookup = (groupInfo: GroupInfo[]) => {
  /**
   * Returns all mrNAs per chromosome
   */
  const lookup: Dictionary<GroupInfo[]> = {}
  groupInfo.forEach((info) => {
    const key = info.phasing_chromosome
    const rows = lookup[key] || []
    rows.push(info)
    lookup[key] = rows
  })
  return lookup
}

export const groupInfoDensity = (groupInfo: GroupInfo[]) => {
  /**
   * Returns all mrNAs per chromosome
   */
  const lookup: Dictionary<GroupInfo[]> = {}
  groupInfo.forEach((item) => {
    const newKey: string = `${item.genome_number}_${item.sequence_number}`
    const rows = lookup[newKey] || []
    rows.push(item)
    lookup[newKey] = rows
  })
  return lookup
}

export const sequencesIdLookup = (
  chrLookup: Dictionary<SequenceMetrics[]>
): Dictionary<Dictionary<number>> => {
  /**
   * Returns a mapping of sequence ids and their initial order per chromosome
   */
  const lookup: Dictionary<Dictionary<number>> = {}
  Object.keys(chrLookup).forEach((key) => {
    const object: Dictionary<number> = chrLookup[key].reduce(
      (
        obj: Dictionary<Dictionary<number>>,
        item: SequenceMetrics,
        dataIndex: number
      ) => Object.assign(obj, { [item.sequence_id]: dataIndex }),
      {}
    )

    lookup[key] = object
  })

  return lookup
}

export const sortedSequenceIdsLookup = (
  chrLookup: Dictionary<SequenceMetrics[]>
) => {
  /**
   * Returns for each chromosome the intial sorting order of sequences
   */
  const lookup: Dictionary<number[]> = {}

  Object.keys(chrLookup).forEach((key) => {
    // console.log(key, chrLookup[key], [...Array(chrLookup[key].length).keys()])

    const ids = lookup[key] || [...Array(chrLookup[key].length).keys()]
    lookup[key] = ids
  })
  return lookup
}

export const sortedGroupInfosLookup = (
  grInfoLookup: Dictionary<GroupInfo[]>,
  seqIdLookup: Dictionary<Dictionary<number>>
) => {
  /**
   * Returns intitial sorting indices of gene set per chromosome
   */
  const lookup: Dictionary<number[]> = {}
  const that = this
  Object.keys(grInfoLookup).forEach((key) => {
    const groupLookup = grInfoLookup[key]
    const sequenceLookup = seqIdLookup[key]
    const ids =
      lookup[key] ||
      groupLookup.map(function (item: GroupInfo) {
        const newKey = `${item.genome_number}_${item.sequence_number}`
        if (key != 'unphased') {
          return sequenceLookup[newKey]
        } else {
          return -99 //map unphased to -99
        }
      })

    lookup[key] = ids
  })

  return lookup
}

// filter outliers GC conent
export const filterOutliers = (someArray: number[]): number[] => {
  if (someArray.length < 4) return someArray

  let values, q1, q3, iqr, maxValue, minValue

  values = someArray.slice().sort((a, b) => a - b) //copy array fast and sort

  if ((values.length / 4) % 1 === 0) {
    //find quartiles
    q1 = (1 / 2) * (values[values.length / 4] + values[values.length / 4 + 1])
    q3 =
      (1 / 2) *
      (values[values.length * (3 / 4)] + values[values.length * (3 / 4) + 1])
  } else {
    q1 = values[Math.floor(values.length / 4 + 1)]
    q3 = values[Math.ceil(values.length * (3 / 4) + 1)]
  }

  iqr = q3 - q1
  maxValue = q3 + iqr * 1.5
  minValue = q1 - iqr * 1.5

  return values.filter((x) => x >= minValue && x <= maxValue)
}
