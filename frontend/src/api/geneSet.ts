import { decode } from 'base64-arraybuffer'
import * as d3 from 'd3'
import { identity } from 'lodash'

import {
  parseBool,
  parseMetadata,
  parseNumber,
  parseString,
} from '@/helpers/parse'
import { useConfigStore } from '@/stores/config'
// import { Config } from './../types'
import type {
  ConfigMetadata,
  GroupInfo,
  Homology,
  SequenceMetrics,
} from '@/types'
import type {
  Cds,
  Domain,
  Exon,
  Gene,
  Genome,
  GenomeData,
  HomologyGroup,
  HomologyLink,
  Locus,
  Mrna,
  SequenceInfo,
} from '@/types'

import { useGenomeStore } from './../stores/geneSet'

export const fetchHomologies = async () => {
  const config = useConfigStore()
  const data = await d3.json<Homology[]>(
    `${config.apiUrl}geneSet/homologies.json`
  )

  return data!.map(({ id, members, alignment_length, ...rest }) => {
    const homology: Homology = {
      id,
      members,
      alignment_length,
      metadata: {},
    }

    // Parse configured metadata.
    config.homology.homologyMetadata.forEach(
      (configMetadata: ConfigMetadata) => {
        homology.metadata[configMetadata.column] =
          rest.metadata[configMetadata.column]
      }
    )

    return homology
  })
}

export const fetchGenomeData = async (): Promise<GenomeData> => {
  const config = useConfigStore()
  const data = await d3.json<GenomeData>(
    `${config.apiUrl}geneSet/yeast_test.json`
  )

  // Combine all sequences into a flat array for the standalone `sequences` property
  const sequences =
    data?.genomes?.flatMap((genome) =>
      genome.sequences.map((sequence) => ({
        uid: sequence.uid,
        sequence_length_nuc: sequence.sequence_length_nuc,
        gene_count: sequence.gene_count,
        phasing: sequence.phasing,
        name: sequence.name,
        id: sequence.id,
        loci: sequence.loci,
      }))
    ) || []

  return {
    genomes:
      data?.genomes?.map(
        (genome): Genome => ({
          uid: genome.uid,
          name: genome.name,
          sequences: genome.sequences.map(
            (sequence): SequenceInfo => ({
              uid: sequence.uid,
              sequence_length_nuc: sequence.sequence_length_nuc,
              gene_count: sequence.gene_count,
              phasing: sequence.phasing,
              name: sequence.name,
              id: sequence.id,
              loci: sequence.loci,
            })
          ),
        })
      ) || [],

    sequences, // Assign the flat array of sequences

    loci:
      data?.loci?.map(
        (locus): Locus => ({
          uid: locus.uid,
          loci_length_nuc: locus.loci_length_nuc,
          genes: locus.genes,
          name: locus.name,
          start: locus.start,
          end: locus.end,
        })
      ) || [],

    genes:
      data?.genes?.map(
        (gene): Gene => ({
          uid: gene.uid,
          names: gene.names,
          strand: gene.strand,
          noncoding_rnas: gene.noncoding_rnas,
          start: gene.start,
          sequence_id: gene.sequence_id,
          end: gene.end,
          label: gene.label,
          gene_length_nuc: gene.gene_length_nuc,
          mrnas: gene.mrnas,
        })
      ) || [],

    mrnas:
      data?.mrnas?.map(
        (mrna): Mrna => ({
          uid: mrna.uid,
          label: mrna.label,
          exons: mrna.exons,
          cds_length_nuc: mrna.cds_length_nuc,
          mrna_length_nuc: mrna.mrna_length_nuc,
          protein_length_aa: mrna.protein_length_aa,
          start: mrna.start,
          end: mrna.end,
          functional_domains: mrna.functional_domains,
          cdss: mrna.cdss,
        })
      ) || [],

    exons:
      data?.exons?.map(
        (exon): Exon => ({
          uid: exon.uid,
          start: exon.start,
          end: exon.end,
        })
      ) || [],

    cds:
      data?.cds?.map(
        (cds): Cds => ({
          uid: cds.uid,
          start: cds.start,
          end: cds.end,
        })
      ) || [],

    functional_domains:
      data?.functional_domains?.map(
        (domain): Domain => ({
          uid: domain.uid,
          domain_id: domain.domain_id,
          domain_type: domain.domain_type,
          name: domain.name,
        })
      ) || [],

    groups:
      data?.groups?.map(
        (hg): HomologyGroup => ({
          uid: hg.uid,
          hidden: hg.hidden,
          label: hg.label,
          mrnas: hg.mrnas,
        })
      ) || [],

    links:
      data?.links?.map(
        (hl): HomologyLink => ({
          uid: hl.uid,
          identity: hl.identity,
          query: hl.query,
          target: hl.target,
        })
      ) || [],
  }
}

// // Function to fetch and process the `.npy` distance matrix
// export const fetchDistanceMatrix = async () => {
//   const config = useConfigStore()
//   try {
//     // Fetch the base64-encoded `.npy` data from the API
//     const response = await fetch(
//       `${config.apiUrl}geneSet/yeast_matrices_test/protein_distance_matrix`
//     )
//     if (!response.ok) {
//       throw new Error(`Failed to fetch distance matrix: ${response.statusText}`)
//     }
//     const { matrix: base64Matrix } = await response.json()

//     // Decode the base64 string to an ArrayBuffer
//     const arrayBuffer = decode(base64Matrix)
//     console.log('Decoded array buffer:', arrayBuffer)

//     // Convert the ArrayBuffer to a Float64Array (since we expect float64 type)
//     const flatMatrix = new Float64Array(arrayBuffer)
//     console.log('Total elements:', flatMatrix.length)

//     // Convert the flat array to a 2D array (square matrix)
//     const size = Math.sqrt(flatMatrix.length) // Calculate matrix size

//     const distanceMatrix = []
//     for (let i = 0; i < size; i++) {
//       distanceMatrix.push(
//         Array.from(flatMatrix.slice(i * size, (i + 1) * size))
//       )
//     }
//     console.log('Matrix shape:', [
//       distanceMatrix.length,
//       distanceMatrix[0].length,
//     ])
//     console.log('Data type:', flatMatrix.constructor.name) // Should be Float64Array
//     console.log('Formatted distance matrix:', distanceMatrix)

//     return distanceMatrix
//   } catch (error) {
//     console.error('Error fetching and decoding distance matrix:', error)
//   }
// }

// Function to fetch and process the JSON distance matrix
export const fetchDistanceMatrix = async () => {
  const config = useConfigStore()
  try {
    // Fetch the JSON-encoded distance matrix from the API
    const response = await fetch(
      `${config.apiUrl}geneSet/yeast_matrices_test/protein_distance_matrix`
    )
    if (!response.ok) {
      throw new Error(`Failed to fetch distance matrix: ${response.statusText}`)
    }

    // Parse the JSON response
    const { matrix } = await response.json()

    // Validate the matrix format
    if (!Array.isArray(matrix) || !Array.isArray(matrix[0])) {
      throw new Error('Invalid matrix format: Expected a 2D array')
    }

    console.log('Matrix shape:', [matrix.length, matrix[0].length])
    console.log('Formatted distance matrix:', matrix)

    // Ensure all numbers are floats
    const floatMatrix = matrix.map(
      (row) => row.map((value) => value * 1.0) // Multiplies by 1.0 to make it float
    )

    console.log(floatMatrix)

    return floatMatrix // Return the 2D array
  } catch (error) {
    console.error('Error fetching and decoding distance matrix:', error)
    return [] // Return an empty array in case of failure
  }
}

export const fetchDistanceMatrixLabels = async () => {
  const config = useConfigStore()
  try {
    // Fetch the JSON labels data from the API
    const response = await fetch(
      `${config.apiUrl}geneSet/yeast_matrices_test/protein_labels`
    )
    if (!response.ok) {
      throw new Error(`Failed to fetch labels: ${response.statusText}`)
    }

    // Parse the JSON response
    const { labels } = await response.json()

    // Log the labels for debugging
    console.log('Fetched labels:', labels)

    return labels // Directly return the labels array
  } catch (error) {
    console.error('Error fetching labels:', error)
    return [] // Return an empty array in case of error
  }
}

// Function to fetch and process the UMAP embedding JSON
export const fetchEmbedding = async () => {
  const config = useConfigStore()
  try {
    // Fetch the UMAP embedding JSON from the API
    const response = await fetch(
      `${config.apiUrl}geneSet/yeast_embeddings_test/protein_umap_embedding`
    )
    if (!response.ok) {
      throw new Error(`Failed to fetch UMAP embedding: ${response.statusText}`)
    }

    // Parse the JSON response
    const { embedding } = await response.json()
    console.log('Loaded UMAP embedding with', embedding.length, 'points.')

    // Each point is already in [x, y] format, so no further processing is needed
    return embedding
  } catch (error) {
    console.error('Error fetching UMAP embedding:', error)
  }
}

// Function to fetch and process the UMAP embedding JSON
export const fetchFilteredEmbedding = async () => {
  const config = useConfigStore()
  try {
    // Fetch the UMAP embedding JSON from the API
    const response = await fetch(
      `${config.apiUrl}geneSet/yeast_embeddings_test/filtered_protein_umap_embedding`
    )
    if (!response.ok) {
      throw new Error(`Failed to fetch UMAP embedding: ${response.statusText}`)
    }

    // Parse the JSON response
    const { embedding } = await response.json()
    console.log('Loaded UMAP embedding with', embedding.length, 'points.')

    // Each point is already in [x, y] format, so no further processing is needed
    return embedding
  } catch (error) {
    console.error('Error fetching UMAP embedding:', error)
  }
}

export const fetchSequences = async () => {
  const config = useConfigStore()
  return await d3.csv<SequenceMetrics, string>(
    `${config.apiUrl}geneSet/sequences.csv`,
    ({
      id,
      sequence_id,
      phasing_chromosome,
      phasing_id,
      genome_number,
      annotation_id,
      sequence_length,
      total_A,
      total_T,
      total_C,
      total_G,
      total_N,
      total_other,
      GC_content_percent,
      sequence_unknown_percent,
      gene_count,
      gene_length_total,
      gene_length_min,
      gene_length_max,
      gene_length_average,
      gene_length_median,
      gene_sequence_percent,
      gene_density_per_Mbp,
    }) => {
      const data: SequenceMetrics = {
        id: parseNumber(id),
        sequence_id: parseString(sequence_id),
        phasing_chromosome: parseNumber(phasing_chromosome),
        phasing_id: parseString(phasing_id),
        genome_number: parseNumber(genome_number),
        annotation_id: parseString(annotation_id),
        sequence_length: parseNumber(sequence_length),
        total_A: parseNumber(total_A),
        total_T: parseNumber(total_T),
        total_C: parseNumber(total_C),
        total_G: parseNumber(total_G),
        total_N: parseNumber(total_N),
        total_other: parseNumber(total_other),
        GC_content_percent: parseNumber(GC_content_percent),
        sequence_unknown_percent: parseNumber(sequence_unknown_percent),
        gene_count: parseNumber(gene_count),
        gene_length_total: parseNumber(gene_length_total),
        gene_length_min: parseNumber(gene_length_min),
        gene_length_max: parseNumber(gene_length_max),
        gene_length_average: parseNumber(gene_length_average),
        gene_length_median: parseNumber(gene_length_median),
        gene_sequence_percent: parseNumber(gene_sequence_percent),
        gene_density_per_Mbp: parseNumber(gene_density_per_Mbp),
      }

      return data
    }
  )
}

export const fetchGroupInfo = async () => {
  const config = useConfigStore()
  return await d3.csv<GroupInfo, string>(
    // `${config.apiUrl}geneSet/group_info.csv`,
    `${config.apiUrl}geneSet/group_info_cdf1_5neighbors.csv`,
    // `${config.apiUrl}geneSet/group_info_cdf_family.csv`,
    ({
      homology_id,
      gene_id,
      gene_name,
      mRNA_id,
      mRNA_name,
      genome_number,
      sequence_number,
      mRNA_start_position,
      mRNA_end_position,
      gene_start_position,
      gene_end_position,
      chromosome,
      strand,
      gene_length_nuc,
      mRNA_length_nuc,
      cds_length_nuc,
      protein_length_AA,
      phasing_chromosome,
    }) => {
      const data: GroupInfo = {
        homology_id: parseNumber(homology_id),
        gene_id: parseString(gene_id),
        gene_name: parseString(gene_name),
        mRNA_id: parseString(mRNA_id),
        mRNA_name: parseString(mRNA_name),
        genome_number: parseNumber(genome_number),
        sequence_number: parseNumber(sequence_number),
        mRNA_start_position: parseNumber(mRNA_start_position),
        mRNA_end_position: parseNumber(mRNA_end_position),
        gene_start_position: parseNumber(gene_start_position),
        gene_end_position: parseNumber(gene_end_position),
        chromosome: parseString(chromosome),
        strand: parseString(strand),
        gene_length_nuc: parseNumber(gene_length_nuc),
        mRNA_length_nuc: parseNumber(mRNA_length_nuc),
        cds_length_nuc: parseNumber(cds_length_nuc),
        protein_length_AA: parseNumber(protein_length_AA),
        phasing_chromosome: parseString(phasing_chromosome),
      }

      return data
    }
  )
}

export const fetchClusteringOrder = async (
  method: number,
  proteinScore: number,
  orderScore: number,
  orientationScore: number,
  sizeScore: number,
  locationScore: number,
  jaccardScore: number
) => {
  const config = useConfigStore()

  const data = await d3.json(
    `${config.apiUrl}geneSet/clustering.json`,

    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        method,
        proteinScore,
        orderScore,
        orientationScore,
        sizeScore,
        locationScore,
        jaccardScore,
      }),
    }
  )

  return data
}
