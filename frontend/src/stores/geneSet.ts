import { ConsoleSqlOutlined } from '@ant-design/icons-vue'
import { type Dictionary, sortBy } from 'lodash'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import {
  fetchDistanceMatrix,
  fetchDistanceMatrixLabels,
  fetchFilteredLabels,
  fetchEmbedding,
  fetchFilteredEmbedding,
  fetchGenomeData,
} from '@/api/geneSet'
import {
  fetchClusteringOrder,
  fetchGroupInfo,
  fetchHomologies,
  fetchSequences,
} from '@/api/geneSet'
import {
  chromosomesLookup,
  createGeneToLociAndSequenceLookup,
  createSequenceToLociGenesLookup,
  groupInfosLookup,
  sequencesIdLookup,
  sortedGroupInfosLookup,
  sortedSequenceIdsLookup,
} from '@/helpers/chromosome'
import { runSpringSimulation } from '@/helpers/springSimulation'
import type { Gene, GenomeData, Locus } from '@/types'
import type { GroupInfo, Homology, SequenceMetrics } from '@/types'

import { useGlobalStore } from './global'
import { Sprite } from 'pixi.js'

export const useGenomeStore = defineStore({
  id: 'genome',
  state: () => ({
    genomeData: {
      genomes: [],
      sequences: [],
      loci: [],
      genes: [],
    } as unknown as GenomeData,
    selectedGenomes: [] as string[],
    selectedSequences: [] as string[],
    selectedSequencesLasso: [] as string[],
    selectedGeneUids: [] as string[],
    sequenceToLociGenesLookup: new Map<
      string,
      { loci: string[]; genes: string[] }
    >(),
    geneToLocusSequenceLookup: new Map<
      string,
      { loci: string; sequence: string }
    >(),
    geneToHomologyGroupLookup: {} as Record<
      string,
      { id: number; uid: string }[]
    >,
    sequenceToMrnaLookup: new Map<string, string[]>(),
    mrnaScoreMatrix: [] as number[][],
    selectedSequencesTracker: new Set(),
    genomeUids: [] as string[], // Array to store genome numbers in the loading order
    genomeUidLookup: {} as Record<string, number>, // Dictionary to map genome name to index
    sequenceUids: [] as string[], // Array to store genome numbers in the loading order
    sequenceUidLookup: {} as Record<string, number>, // Dictionary to map genome name to index
    distanceMatrix: [],
    distanceMatrixLabels: {},
    distanceMatrixLabelsFiltered: {},
    embedding: [],
    embeddingFiltered: [],
    filterEmpty: false,
    filteredSequences: [],
    isInitialized: false,
  }),
  getters: {
    genomeCount: (state) => state.genomeData?.genomes?.length || 0,
    sequenceCount: (state) => state.genomeData?.sequences?.length || 0,
    lociCount: (state) => state.genomeData?.loci?.length || 0,
    geneCount: (state) => state.genomeData?.genes?.length || 0,
    mrnaCount: (state) => state.genomeData?.mrnas?.length || 0,
    cdsCount: (state) => state.genomeData?.cds?.length || 0,
    exonCount: (state) => state.genomeData?.exons?.length || 0,
    domainCount: (state) => state.genomeData?.functional_domains?.length || 0,
    homologyGroupCount: (state) => state.genomeData?.groups?.length || 0,
    homologyLinkCount: (state) => state.genomeData?.links?.length || 0,
    genomeNames: (state) =>
      state.genomeData?.genomes?.map((genome) => genome.name) || [],
    sequenceNames: (state) =>
      state.genomeData?.sequences?.map((sequence) => sequence.name) || [],
    sequenceUidsWithLoci(state) {
      return state.genomeData.sequences
        .filter((sequence) => sequence.loci && sequence.loci.length > 0)
        .map((sequence) => sequence.uid)
    },
  },
  actions: {
    toggleFilterEmpty() {
      this.filterEmpty = !this.filterEmpty
    },
    updateFilteredSequences() {
      this.filteredSequences = this.genomeData.sequences.filter(
        (sequence) => sequence.loci && sequence.loci.length > 0
      )
    },
    async loadGenomeData() {
      const global = useGlobalStore()

      try {
        this.genomeData = await fetchGenomeData()
        this.generateIndicesAndLookup()
        this.sequenceToLociGenesLookup = createSequenceToLociGenesLookup(
          this.genomeData
        )
        this.geneToLocusSequenceLookup = createGeneToLociAndSequenceLookup(
          this.genomeData
        )

        this.updateFilteredSequences()

        this.generateMrnaScoreMatrix()

        // Fetch and set the distance matrix
        const matrix = await fetchDistanceMatrix()
        this.setDistanceMatrix(matrix)

        const labels = await fetchDistanceMatrixLabels()
        if (labels && labels.length > 0) {
          // Transform the labels array into a lookup with the index
          this.distanceMatrixLabels = labels.reduce((lookup, label, index) => {
            lookup[label] = index
            return lookup
          }, {})
        } else {
          this.distanceMatrixLabels = {} // Set as an empty object if no labels are found
        }

        const labelsFiltered = await fetchFilteredLabels()
        if (labelsFiltered && labelsFiltered.length > 0) {
          // Transform the labels array into a lookup with the index
          this.distanceMatrixLabelsFiltered = labelsFiltered.reduce(
            (lookup, label, index) => {
              lookup[label] = index
              return lookup
            },
            {}
          )
        } else {
          this.distanceMatrixLabelsFiltered = {} // Set as an empty object if no labels are found
        }

        // Fetch and set the embedding matrix
        const embedding = await fetchEmbedding()
        this.setEmbeddingMatrix(embedding)

        const embeddingFiltered = await fetchFilteredEmbedding()
        this.setFilteredEmbeddingMatrix(embeddingFiltered)
      } catch (error) {
        global.setError({
          message: 'Could not load or parse genome data.',
          isFatal: true,
        })
        throw error
      }

      this.initializeSelectedSequencesLasso()

      // Set initialized flag only after all API calls complete successfully
      this.isInitialized = true
    },
    initializeSelectedSequencesLasso() {
      console.log('initializing lasso selection')

      // Initialize lasso with non-emtpy sequences
      this.selectedSequencesLasso = this.sequenceUidsWithLoci.slice(0,3)

      // Add to selectedSequencesTracker
      this.sequenceUidsWithLoci.forEach((uid) =>
        this.selectedSequencesTracker.add(uid)
      )
    },
    generateMrnaScoreMatrix() {
      // Step 1: Gather all unique mrna_uids from groups that contain more than one mRNA
      const uniqueMrnaUids = new Set<string>()
      this.genomeData.groups.forEach((group) => {
        if (group.mrnas.length > 1) {
          group.mrnas.forEach((mrna) => uniqueMrnaUids.add(mrna))
        }
      })

      const mrnaUids = Array.from(uniqueMrnaUids)
      this.mrnaUidIndexLookup = mrnaUids.reduce((lookup, uid, index) => {
        lookup[uid] = index
        return lookup
      }, {} as Record<string, number>)

      const size = mrnaUids.length

      // Step 2: Initialize the matrix with NaN values
      this.mrnaScoreMatrix = Array.from({ length: size }, () =>
        Array(size).fill(NaN)
      )

      // // Step 3: Populate the matrix with normalized identity scores from links
      // this.genomeData.links.forEach((link) => {
      //   const queryUid = link.query.uid
      //   const targetUid = link.target.uid
      //   const identityScore = link.identity

      //   if (
      //     this.mrnaUidIndexLookup.hasOwnProperty(queryUid) &&
      //     this.mrnaUidIndexLookup.hasOwnProperty(targetUid)
      //   ) {
      //     const queryIndex = this.mrnaUidIndexLookup[queryUid]
      //     const targetIndex = this.mrnaUidIndexLookup[targetUid]
      //     const normalizedScore = identityScore ? identityScore / 100 : 0

      //     this.mrnaScoreMatrix[queryIndex][targetIndex] = normalizedScore
      //     this.mrnaScoreMatrix[targetIndex][queryIndex] = normalizedScore
      //   }
      // })

      // Step 4: Replace any remaining NaN values with 0
      this.mrnaScoreMatrix = this.mrnaScoreMatrix.map((row) =>
        row.map((value) => (isNaN(value) ? 0 : value))
      )
      // // Step 3: Create a map of links to batch updates
      // const linkMap = new Map<string, Map<string, number>>()

      // this.genomeData.links.forEach((link) => {
      //   const queryUid = link.query.uid
      //   const targetUid = link.target.uid
      //   const identityScore = link.identity ?? 0 // Default to 0 if undefined

      //   if (!linkMap.has(queryUid)) {
      //     linkMap.set(queryUid, new Map<string, number>())
      //   }
      //   if (!linkMap.has(targetUid)) {
      //     linkMap.set(targetUid, new Map<string, number>())
      //   }

      //   // Update both [query -> target] and [target -> query]
      //   linkMap.get(queryUid)!.set(targetUid, identityScore)
      //   linkMap.get(targetUid)!.set(queryUid, identityScore)
      // })

      // // Step 4: Populate the matrix using the precomputed linkMap
      // linkMap.forEach((targets, queryUid) => {
      //   if (!this.mrnaUidIndexLookup.hasOwnProperty(queryUid)) return
      //   const queryIndex = this.mrnaUidIndexLookup[queryUid]

      //   targets.forEach((identityScore, targetUid) => {
      //     if (!this.mrnaUidIndexLookup.hasOwnProperty(targetUid)) return
      //     const targetIndex = this.mrnaUidIndexLookup[targetUid]

      //     const normalizedScore = identityScore / 100
      //     this.mrnaScoreMatrix[queryIndex][targetIndex] = normalizedScore
      //     this.mrnaScoreMatrix[targetIndex][queryIndex] = normalizedScore
      //   })
      // })
    },
    generateIndicesAndLookup() {
      this.genomeUids = this.genomeData.genomes.map((genome) => genome.uid) // Populate genomeNrs array
      this.sequenceUids = this.genomeData.sequences.map((seq) => seq.uid) // Populate genomeNrs array

      // Populate genomeNrLookup with uid as key and index as value
      this.genomeUidLookup = this.genomeData.genomes.reduce(
        (lookup, genome, index) => {
          lookup[genome.uid] = index // Use uid as key and index as value
          return lookup
        },
        {} as Record<string, number>
      )

      this.sequenceUidLookup = this.genomeData.sequences.reduce(
        (lookup, sequence, index) => {
          lookup[sequence.uid] = index // Use uid as key and index as value
          return lookup
        },
        {} as Record<string, number>
      )

      const mRNAToHomologyGroup: Record<string, { id: number; uid: string }> =
        {}

      this.genomeData.groups.forEach((group) => {
        group.mrnas.forEach((mrna_uid) => {
          mRNAToHomologyGroup[mrna_uid] = {
            id: group.label,
            uid: group.uid,
          }
        })
      })
      // Populate geneToHomologyGroupLookup using mRNA to homology group mapping
      this.geneToHomologyGroupLookup = this.genomeData.genes.reduce(
        (lookup, gene) => {
          const homologyGroups = new Map<number, { id: number; uid: string }>()

          gene.mrnas.forEach((mRNA) => {
            const homologyGroupInfo = mRNAToHomologyGroup[mRNA]
            if (homologyGroupInfo) {
              homologyGroups.set(homologyGroupInfo.id, homologyGroupInfo)
            }
          })

          lookup[gene.uid] = Array.from(homologyGroups.values()) // Convert Map to array
          return lookup
        },
        {} as Record<string, { id: number; uid: string }[]>
      )

      // Populate sequenceToMrnaLookup
      this.sequenceToMrnaLookup = this.genomeData.genes.reduce(
        (lookup, gene) => {
          const sequenceUid = this.geneToLocusSequenceLookup.get(
            gene.uid
          )?.sequence
          if (sequenceUid) {
            if (!lookup[sequenceUid]) {
              lookup[sequenceUid] = []
            }
            lookup[sequenceUid].push(...gene.mrnas) // Add mRNA UIDs for this gene
          }
          return lookup
        },
        new Map<string, string[]>()
      )

      // Extend each gene object in genomeData.genes with its homology groups
      this.genomeData.genes = this.genomeData.genes.map((gene) => ({
        ...gene,
        homology_groups: this.geneToHomologyGroupLookup[gene.uid] || [],
      }))

      // Extend each gene object in genomeData.genes with its sequence uid
      this.genomeData.genes = this.genomeData.genes.map((gene) => ({
        ...gene,
        sequence_uid: this.geneToLocusSequenceLookup.get(gene.uid)?.sequence,
      }))
    },
    getGenesForSelectedLasso(): string[] {
      const genes: string[] = []
      const selectedSequenceUids = this.selectedSequencesLasso

      // console.log('sequenceToLociGenesLookup', this.sequenceToLociGenesLookup)
      selectedSequenceUids.forEach((sequenceUid) => {
        const lociAndGenes = this.sequenceToLociGenesLookup.get(sequenceUid)

        if (lociAndGenes) {
          // Add loci genes to the main genes list
          genes.push(...lociAndGenes.genes)
        } else {
          console.warn(`No loci found for sequence UID: ${sequenceUid}`)
        }
      })

      return genes
    },
    setDistanceMatrix(matrix) {
      this.distanceMatrix = matrix // Set the matrix using an action
    },
    setEmbeddingMatrix(embedding_matrix) {
      this.embedding = embedding_matrix // Set the matrix using an action
    },
    setFilteredEmbeddingMatrix(embedding_matrix) {
      this.embeddingFiltered = embedding_matrix // Set the matrix using an action
    },
    setSelectedGenomes(genomeNames: string[]) {
      this.selectedGenomes = genomeNames
    },
    setSelectedSequences(sequenceNames: string[]) {
      this.selectedSequences = sequenceNames
    },
    setSelectedSequencesLasso(sequenceUids: string[]) {
      this.selectedSequencesLasso = sequenceUids
    },
    setSelectedSequencesTracker(sequenceUid) {
      this.selectedSequencesTracker.add(sequenceUid)
    },
    setSelectedGeneUids(uids: string[]) {
      this.selectedGeneUids = uids
    },
  },
})
export const useGeneSetStore = defineStore('geneSet', {
  state: () => ({
    // Data from API
    genomeData: null as GenomeData | null,
    homologies: [] as Homology[],
    sequences: [] as SequenceMetrics[],
    groupInfo: [] as GroupInfo[],
    chromosomes: [] as (Number | String)[],
    numberOfChromosomes: 0,
    chrFocus: 5,
    chrFocusDensity: {},
    homologyFocus: 232273529, //set to CDF1
    homologyGroups: [] as number[],
    upstreamHomologies: [] as number[],

    // Sorting
    sorting: 'genome_number',
    sortedChromosomeSequenceIndices: {} as Dictionary<number[]>,
    sortedMrnaIndices: {},

    // Clustering
    linkage: 3,
    clusteringOrder: {} as any,
    protein: 50,
    orientation: 0,
    size: 0,
    location: 0,
    jaccard: 0,
    order: 50,

    //Context
    percentageGC: true,
    allSequences: true,
    colorGenomes: false,

    // Spring simulation forces
    scaleXForce: 1,
    scaleYForce: 1000,
    scaleContraction: 100,
    scaleRepulsion: 1,
    minimumDistance: 1000,
    rerunSimulation: false,

    //Graphics
    overviewArrows: false,
    showTable: false,
    showDetails: true,
    showNotificationsDetail: false,
    showNotificationsOverview: true,
    anchor: true,
    colorGenes: true,
    showLinks: false,

    isInitialized: false,
  }),
  actions: {
    async initialize() {
      const global = useGlobalStore()

      this.chromosomes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 'unphased'] // to-do: get from data!
      this.numberOfChromosomes = this.chromosomes.length

      //// GENE NEIGHBORS
      this.homologyGroups = [
        232273967, 232290249, 232273731, 232273868, 232273529, 232273685,
        232274335, 232292464, 232273544, 232290464,
      ]
      this.upstreamHomologies = [
        // 232273967, 232290249, 232273731, 232273868, 232273685, 232273529,
        232274335, 232292464, 232273544, 232290464,
      ]

      // //// GENE FAMILY
      // this.homologyGroups = [
      //   232263008, 232263009, 232269781, 232269782, 232273529,
      // ]

      try {
        this.genomeData = await fetchGenomeData()
      } catch (error) {
        global.setError({
          message: 'Could not load or parse genome data.',
          isFatal: true,
        })
        throw error
      }
      try {
        this.homologies = sortBy(await fetchHomologies(), 'id')
      } catch (error) {
        global.setError({
          message: 'Could not load or parse homologies.',
          isFatal: true,
        })
        throw error
      }

      try {
        this.sequences = await fetchSequences()
      } catch (error) {
        global.setError({
          message: 'Could not load or parse sequence metrics.',
          isFatal: true,
        })
        throw error
      }

      try {
        this.groupInfo = await fetchGroupInfo()
      } catch (error) {
        global.setError({
          message: 'Could not load or parse group info.',
          isFatal: true,
        })
        throw error
      }

      // constants
      const chrLookup = chromosomesLookup(this.sequences)
      const grInfoLookup = groupInfosLookup(this.groupInfo)
      const seqLookup = sequencesIdLookup(chrLookup)

      try {
        // const chrLookup = chromosomesLookup(this.sequences)
        this.sortedChromosomeSequenceIndices =
          sortedSequenceIdsLookup(chrLookup)
      } catch (error) {
        global.setError({
          message: 'Could not parse sorted chromosome sequence ids.',
          isFatal: true,
        })
        throw error
      }

      try {
        this.sortedMrnaIndices = sortedGroupInfosLookup(grInfoLookup, seqLookup)
      } catch (error) {
        global.setError({
          message: 'Could not parse sorted chromosome mrna ids.',
          isFatal: true,
        })
        throw error
      }

      try {
        this.clusteringOrder = await fetchClusteringOrder(
          this.linkage,
          this.protein,
          this.order,
          this.orientation,
          this.size,
          this.location,
          this.jaccard
        )
      } catch (error) {
        global.setError({
          message: 'Could not load or parse clustering result.',
          isFatal: true,
        })
        throw error
      }

      this.isInitialized = true
    },
    async changeSorting(sorting: string) {
      // Update the sorting
      this.sorting = sorting

      const chrLookup = chromosomesLookup(this.sequences)
      const seqLookup = sequencesIdLookup(chrLookup)
      const grInfoLookup = groupInfosLookup(this.groupInfo)

      // default sorting
      if (sorting === 'genome_number_asc') {
        const grInfoLookup = groupInfosLookup(this.groupInfo)

        this.sortedChromosomeSequenceIndices =
          sortedSequenceIdsLookup(chrLookup)
        this.sortedMrnaIndices = sortedGroupInfosLookup(grInfoLookup, seqLookup)

        return
      }

      // reverse sorting
      if (sorting === 'genome_number_desc') {
        const objectMap = (obj: any, fn: (v: any, k: any, i: any) => any) =>
          Object.fromEntries(
            Object.entries(obj).map(([k, v], i) => [k, fn(v, k, i)])
          )

        this.sortedChromosomeSequenceIndices = objectMap(
          this.sortedChromosomeSequenceIndices,
          (v) => [...v].reverse()
        )
        console.log(
          'reversed sortedChromosomeSequenceIndices',
          this.sortedChromosomeSequenceIndices[5]
        )

        // update mrnaIdLookup
        const seqLookupNew: Dictionary<Dictionary<number>> = {} // need to update old?
        Object.keys(seqLookup).forEach((chr) => {
          const chrObj: Dictionary<number> = {}

          Object.keys(seqLookup[chr]).forEach((key) => {
            const idx = seqLookup[chr][key]

            chrObj[key] = this.sortedChromosomeSequenceIndices[chr][idx]
          })
          seqLookupNew[chr] = chrObj
        })

        this.sortedMrnaIndices = sortedGroupInfosLookup(
          grInfoLookup,
          seqLookupNew
        )
        // console.log('mrna new', this.sortedMrnaIndices)

        return
      }

      if (sorting === 'protein') {
        this.clusteringOrder = await fetchClusteringOrder(
          this.linkage,
          this.protein,
          this.order,
          this.orientation,
          this.size,
          this.location,
          this.jaccard
        )
        // console.log('protein sorting', this.linkage, this.clusteringOrder)
        // console.log('sequenceLookup', seqLookup)

        const lookup: Dictionary<number[]> = {}
        Object.keys(seqLookup).forEach((chr) => {
          const proteinArray: string[] = this.clusteringOrder[chr]

          const newLookupProt = Object.fromEntries(
            proteinArray.map((sequenceID, dataIndex) => [sequenceID, dataIndex])
          )
          const proteinIndices: number[] = []
          // console.log('newLookupProt', newLookupProt)

          Object.keys(seqLookup[chr]).forEach((key) => {
            console.log(key, newLookupProt[key])
            proteinIndices.push(newLookupProt[key])
          })

          // // Pass a function to map
          // const proteinIndices = proteinArray.map(
          //   (item) => this.sequenceIdLookup[chr][item]
          // )
          // console.log(proteinIndices)
          lookup[chr] = proteinIndices
        })
        console.log('lookup', lookup)
        this.sortedChromosomeSequenceIndices = lookup

        // update mrnaIdLookup
        const seqLookupNew: Dictionary<Dictionary<number>> = {} // need to update old?
        Object.keys(seqLookup).forEach((chr) => {
          const chrObj: Dictionary<number> = {}

          Object.keys(seqLookup[chr]).forEach((key) => {
            const idx = seqLookup[chr][key]

            chrObj[key] = this.sortedChromosomeSequenceIndices[chr][idx]
          })
          seqLookupNew[chr] = chrObj
        })

        this.sortedMrnaIndices = sortedGroupInfosLookup(
          grInfoLookup,
          seqLookupNew
        )

        return
      }
    },
    deleteChromosome(chr: string) {
      console.log('delete chromosome', chr)
      const chromosomesUpdated = [...this.chromosomes]
      const value = parseInt(chr.split('chr')[1])
      const index = chromosomesUpdated.indexOf(value)

      if (index > -1) {
        // only splice array when item is found
        chromosomesUpdated.splice(index, 1) // 2nd parameter means remove one item only
      }

      this.numberOfChromosomes = chromosomesUpdated.length
      this.chromosomes = chromosomesUpdated
    },
    getChromosome(key: string) {
      return this.chromosomeLookup[key]
    },
    getGroupInfo(key: string) {
      return this.groupInfoLookup[key]
    },
    updateSimulation() {
      this.rerunSimulation = true
      // [newGenePositions, nodeGroups, heat] = runSpringSimulation(newGenePositions, this.data ?? [], 1000, 100, 232273529)
      // currentHeat.value = heat
      // crossingHomologyGroups.value = crossDetection(newGenePositions)

      // currentGraphNodeGroups.value = nodeGroups
    },
  },
  getters: {
    chromosomeLookup() {
      /**
       * Returns all sequences per chromosome
       */
      const lookup: Dictionary<SequenceMetrics[]> = {}
      this.sequences.forEach((sequence) => {
        const key = sequence.phasing_chromosome
        const rows = lookup[key] || []
        rows.push(sequence)
        lookup[key] = rows
      })
      return lookup
    },
    sequenceIdLookup() {
      /**
       * Returns a mapping of sequence ids and their initial order per chromosome
       */
      const lookup: Dictionary<Dictionary<number>> = {}
      Object.keys(this.chromosomeLookup).forEach((key) => {
        const object = this.chromosomeLookup[key].reduce(
          (obj, item, dataIndex) =>
            Object.assign(obj, { [item.sequence_id]: dataIndex }),
          {}
        )

        lookup[key] = object
      })

      return lookup
    },
    groupInfoLookup() {
      /**
       * Returns all mrNAs per chromosome
       */
      const lookup: Dictionary<GroupInfo[]> = {}
      this.groupInfo.forEach((info: GroupInfo) => {
        const key = info.phasing_chromosome
        const rows: GroupInfo[] = lookup[key] || []
        rows.push(info)
        lookup[key] = rows
      })
      return lookup
    },
    sortedGroupInfoLookup() {
      /**
       * Returns intitial sorting indices of gene set per chromosome
       */
      const lookup: Dictionary<number | number[]> = {}
      const that = this
      Object.keys(this.groupInfoLookup).forEach((key) => {
        const groupLookup = this.groupInfoLookup[key]
        const ids =
          lookup[key] ||
          groupLookup.map(function (item) {
            const newKey = `${item.genome_number}_${item.sequence_number}`
            if (key != 'unphased') {
              return that.sequenceIdLookup[key][newKey]
            } else {
              return -99 //map unphased to -99
            }
          })

        lookup[key] = ids
      })

      return lookup
    },
  },
})
