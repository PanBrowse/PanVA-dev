from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import sys
import os
import pandas as pd
import numpy as np
import base64
from dotenv import load_dotenv
from flask_json_schema import JsonSchema

from cluster_functions import (
    create_dendrogram,
    filtered_linkage_matrix,
    load_linkage_matrix,
    save_linkage_matrix,
    create_linkage_matrix,
    get_clustering_leaves,
    get_clustering_leaves_new,
)

# Dendrogram can be very deep.
# Default recursion depth (1000) is hit when encoding to JSON.
sys.setrecursionlimit(2500)

# Load config from `.env` file into environment variables.
load_dotenv(".env")

# Get non-Flask configuration options from environment variables.
db_path = os.environ.get("API_DB_PATH")
print("db_path", db_path)

# Configuration for datasets
DATASET_CONFIG = {
    "rose": {
        "embedding_filtered": os.path.join(db_path, "geneSet", "rose", "filtered_embedding_rose_neighbors4_minDist0.1_seed42.json"),
        "embedding": os.path.join(db_path, "geneSet", "rose", "embedding_rose_neighbors10_minDist0.5_seed42.json"),
        "labels_filtered": os.path.join(db_path, "geneSet", "rose", "filtered_protein_distance_labels.json"),
        "labels": os.path.join(db_path, "geneSet", "rose", "protein_distance_labels.json"),
        "distance_matrix": os.path.join(db_path, "geneSet", "rose", "protein_distance_matrix.npy"),
    },
    "yeast": {
        "embedding_filtered": os.path.join(db_path, "geneSet", "yeast", "filtered_embedding_yeast_neighbors2_minDist0.1_seed42.json"),
        "embedding": os.path.join(db_path, "geneSet", "yeast", "embedding_neighbors10_minDist0.1_seed42.json"),
        "labels_filtered": os.path.join(db_path, "geneSet", "yeast", "filtered_protein_distance_labels.json"),
        "labels": os.path.join(db_path, "geneSet", "yeast", "protein_distance_labels.json"),
        "distance_matrix": os.path.join(db_path, "geneSet", "yeast", "protein_distance_matrix.npy"),
    },
     "yeast14": {
        "embedding_filtered": os.path.join(db_path, "geneSet", "yeast14", "filtered_embedding_yeast14_neighbors2_minDist0.1_seed42.json"),
        "embedding": os.path.join(db_path, "geneSet", "yeast14", "embedding_yeast14_neighbors10_minDist0.1_seed42.json"),
        "labels_filtered": os.path.join(db_path, "geneSet", "yeast14", "filtered_protein_distance_labels.json"),
        "labels": os.path.join(db_path, "geneSet", "yeast14", "protein_distance_labels.json"),
        "distance_matrix": os.path.join(db_path, "geneSet", "yeast14", "protein_distance_matrix.npy"),
    },
    "capsicum": {
        "embedding_filtered": os.path.join(db_path, "geneSet", "capsicum", "filtered_embedding_capsicum_neighbors2_minDist0.1_seed42.json"),
        "embedding": os.path.join(db_path, "geneSet", "capsicum", "embedding_capsicum_neighbors360_minDist0.2_seed42.json"),
        "labels_filtered": os.path.join(db_path, "geneSet", "capsicum", "filtered_protein_distance_labels.json"),
        "labels": os.path.join(db_path, "geneSet", "capsicum", "protein_distance_labels.json"),
        "distance_matrix": os.path.join(db_path, "geneSet", "capsicum", "filtered_protein_distance_matrix.npy"),
    },
     "capsicum_small": {
        "embedding_filtered": os.path.join(db_path, "geneSet", "capsicum_small", "filtered_embedding_capsicum_small_neighbors2_minDist0.1_seed42.json"),
        "embedding": os.path.join(db_path, "geneSet", "capsicum_small", "embedding_capsicum_small_neighbors10_minDist0.1_seed42.json"),
        "labels_filtered": os.path.join(db_path, "geneSet", "capsicum_small", "filtered_protein_distance_labels.json"),
        "labels": os.path.join(db_path, "geneSet", "capsicum_small", "protein_distance_labels.json"),
        "distance_matrix": os.path.join(db_path, "geneSet", "capsicum_small", "filtered_protein_distance_matrix.npy"),
    }
}

# Default dataset
DEFAULT_DATASET = "yeast"  


# Instantiate the app.
app = Flask(
    __name__,
    # Static files in `db_path` will be served by Flask.
    # In production, this should be handled by a webserver.
    static_url_path="",
    static_folder=db_path,
)

# Load Flask configuration options from environment variables (prefixed with API_).
app.config.from_prefixed_env("API")

# Enable CORS.
CORS(app)

# Enable JSON Schema validation.
schema = JsonSchema(app)


@app.route("/homology/<id>/dendrogram.json", methods=["GET", "POST"])
@schema.validate(
    {
        "type": "object",
        "properties": {
            "positions": {
                "type": "array",
                "items": {
                    "type": "integer",
                    "minimum": 0,
                },
            }
        },
        "required": ["positions"],
    }
)
def get_dendrogram(id):
    sequences_path = os.path.join(db_path, "homology", id, "sequences.csv")
    linkage_matrix_path = os.path.join(db_path, "homology", id, "linkage_matrix.npy")

    # Load sequences data.
    sequences = pd.read_csv(sequences_path)

    # Load linkage matrix, or create if it does not exist.
    linkage_matrix = load_linkage_matrix(linkage_matrix_path)
    if linkage_matrix is None:
        linkage_matrix = save_linkage_matrix(linkage_matrix_path, sequences)

    labels = sequences["mRNA_id"].to_list()

    # Generate custom dendrogram based on passed positions.
    if request.method == "POST":
        positions = request.json["positions"]
        linkage_matrix = filtered_linkage_matrix(
            linkage_matrix, sequences, positions, labels
        )

    return create_dendrogram(linkage_matrix, labels)

#### new route geneSets ####
@app.route('/geneSet/<dataset>/filtered_protein_umap_embedding', methods=['GET'])
def get_umap_embedding_filtered(dataset):
    dataset = dataset or DEFAULT_DATASET
    embedding_path = DATASET_CONFIG[dataset]["embedding_filtered"]
   
    print("Loading embedding from:", embedding_path)
    
    # Load the JSON embedding
    try:
        with open(embedding_path, "r") as f:
            embedding = json.load(f)
        print("Loaded embedding with", len(embedding), "points.")
        
        # Return the embedding as JSON
        return jsonify({"embedding": embedding})
    except Exception as e:
        print("Error loading embedding:", e)
        return jsonify({"error": "Failed to load embedding"}), 500
    
@app.route('/geneSet/<dataset>/protein_umap_embedding', methods=['GET'])
def get_umap_embedding(dataset):
    dataset = dataset or DEFAULT_DATASET
    embedding_path = DATASET_CONFIG[dataset]["embedding"]
    print("Loading embedding from:", embedding_path)
    
    # Load the JSON embedding
    try:
        with open(embedding_path, "r") as f:
            embedding = json.load(f)
        print("Loaded embedding with", len(embedding), "points.")
        
        # Return the embedding as JSON
        return jsonify({"embedding": embedding})
    except Exception as e:
        print("Error loading embedding:", e)
        return jsonify({"error": "Failed to load embedding"}), 500

@app.route('/geneSet/<dataset>/filtered_protein_labels', methods=['GET'])
def get_labels_filtered(dataset):
    dataset = dataset or DEFAULT_DATASET
    labels_path = DATASET_CONFIG[dataset]["labels_filtered"]
    print("Loading filtered labels from:", labels_path)

    try:
        # Load the labels from the JSON file
        with open(labels_path, "r") as f:
            labels = json.load(f)

        print("Labels loaded:", labels)

        # Return the labels as JSON
        return jsonify({"labels": labels})
    except Exception as e:
        print("Error loading labels:", str(e))
        return jsonify({"error": str(e)}), 500

    
@app.route('/geneSet/<dataset>/protein_labels', methods=['GET'])
def get_labels(dataset):
    dataset = dataset or DEFAULT_DATASET
    labels_path = DATASET_CONFIG[dataset]["labels"]
    print("Loading labels from:", labels_path)

    try:
        # Load the labels from the JSON file
        with open(labels_path, "r") as f:
            labels = json.load(f)

        print("Labels loaded:", labels)

        # Return the labels as JSON
        return jsonify({"labels": labels})
    except Exception as e:
        print("Error loading labels:", str(e))
        return jsonify({"error": str(e)}), 500

    
@app.route('/geneSet/<dataset>/protein_distance_matrix', methods=['GET'])
def get_distance_matrix(dataset):
    dataset = dataset or DEFAULT_DATASET
    matrix_path = DATASET_CONFIG[dataset]["distance_matrix"]
    print("Loading distance matrix from:", matrix_path)

    try:
        # Load the matrix from the .npy file
        matrix = np.load(matrix_path)
        print("Matrix shape:", matrix.shape)
        print("Total elements:", matrix.size)
        print("Data type:", matrix.dtype)

        # Convert the numpy array to a nested list for JSON compatibility
        matrix_list = matrix.tolist()
        
        # Return the matrix as JSON
        return jsonify({"matrix": matrix_list})
    except Exception as e:
        print("Error loading distance matrix:", str(e))
        return jsonify({"error": str(e)}), 500
    

@app.route("/geneSet/<dataset>/clustering_new.json", methods=["GET", "POST"])
def get_clustering_order_new(dataset):
    dataset = dataset or DEFAULT_DATASET


    sequences_path = os.path.join(db_path, "geneSet", dataset, "protein_distance_labels.json")
    matrix_path_proteins = os.path.join(db_path, "geneSet", dataset, "protein_distance_matrix.npy")
    matrix_path_order = os.path.join(db_path, "geneSet", dataset, "levenshtein_distance_matrix.npy")
    matrix_path_orientation = os.path.join(db_path, "geneSet", dataset, "orientation_distance_matrix.npy") #replace
    matrix_path_size = os.path.join(db_path, "geneSet", dataset, "protein_distance_matrix.npy") #replace
    matrix_path_location = os.path.join(db_path, "geneSet", dataset, "multiset_jaccard_distance_matrix.npy") #replace
    matrix_path_jaccard = os.path.join(db_path, "geneSet", dataset, "jaccard_distance_matrix.npy")
    matrix_path_multijaccard = os.path.join(db_path, "geneSet", dataset, "multiset_jaccard_distance_matrix.npy") #replace


    # Load the labels from the JSON file
    with open(sequences_path, "r") as f:
        labels = json.load(f)

     # Load data matrix
    data_matrix_proteins = np.load(matrix_path_proteins)
    data_matrix_proteins = (data_matrix_proteins + data_matrix_proteins.T) / 2
    np.fill_diagonal(data_matrix_proteins, 0)
    data_matrix_order = np.load(matrix_path_order)
    np.fill_diagonal(data_matrix_order, 0)
    data_matrix_orientation = np.load(matrix_path_orientation)
    np.fill_diagonal(data_matrix_orientation, 0)
    data_matrix_size = np.load(matrix_path_size)
    np.fill_diagonal(data_matrix_size, 0)
    data_matrix_location = np.load(matrix_path_location)
    np.fill_diagonal(data_matrix_location, 0)
    data_matrix_jaccard = np.load(matrix_path_jaccard)
    np.fill_diagonal(data_matrix_jaccard, 0)
    data_matrix_multijaccard = np.load(matrix_path_multijaccard)
    np.fill_diagonal(data_matrix_multijaccard, 0)

     # Create default linkage matrix
    print("using default linkage matrix")
    linkage_matrix = create_linkage_matrix(data_matrix_proteins, "ward")

    if request.method == "POST":

        # get scores and multiply with matrices
        protein_score = request.json["proteinScore"]/100
        order_score = request.json["orderScore"]/100
        orientation_score = request.json["orientationScore"]/100
        size_score = request.json["sizeScore"]/100
        location_score = request.json["locationScore"]/100
        jaccard_score = request.json["jaccardScore"]/100
        multijaccard_score = request.json["multiJaccardScore"]/100
        print('proteinScore', protein_score)
        print('orderScore', order_score)
        print('orientationScore', orientation_score)
        print('sizeScore', size_score)
        print('locationScore', location_score)
        print('jaccardScore', jaccard_score)
        print('multiJaccardScore', multijaccard_score)

        matrix_proteins = protein_score * data_matrix_proteins
        matrix_order = order_score * data_matrix_order
        matrix_orientation = orientation_score * data_matrix_orientation
        matrix_size = size_score * data_matrix_size
        matrix_location = location_score * data_matrix_location
        matrix_jaccard = jaccard_score * data_matrix_jaccard
        matrix_multijaccard = multijaccard_score * data_matrix_multijaccard


        list_matrices = [matrix_proteins, matrix_order, matrix_orientation, matrix_size, matrix_location, matrix_jaccard, matrix_multijaccard]

        matrix_combined = np.sum(list_matrices, axis=0)
        matrix_combined = (matrix_combined + matrix_combined.T) / 2
        np.fill_diagonal(matrix_combined, 0)
        

        method = request.json["method"]
        methods = ["average", "complete", "single", "ward"]
        if method == None:
            linkage_method = "ward"
        else:
            linkage_method = methods[method]
        print("method", methods[method])

        # Create linkage matrix
        print("using combined linkage matrix")
        linkage_matrix = create_linkage_matrix(matrix_combined,  linkage_method)

        # response = {
        #     "scores": {
        #         "proteinScore": protein_score,
        #         "orderScore": order_score,
        #         "orientationScore": orientation_score,
        #         "sizeScore": size_score,
        #         "locationScore": location_score,
        #         "jaccardScore": jaccard_score,
        #     },
        # }

        # return jsonify(response)

    # Load linkage matrix labels
    sorted_leaf_labels = get_clustering_leaves_new(linkage_matrix, labels)


    # json_object = json.dumps(sorted_leaf_labels, indent = 4) 
    print('sorted labels', sorted_leaf_labels)

    return jsonify(sorted_leaf_labels)
    # return jsonify({"message": "This endpoint accepts POST requests."})

@app.route("/geneSet/clustering.json", methods=["GET", "POST"])
def get_clustering_order():

    sequences_path = os.path.join(db_path, "geneSet", "sequences.csv")
    # matrix_path = os.path.join(db_path, "geneSet", "protein_distance_matrix.npy")
    matrix_path_proteins = os.path.join(db_path, "geneSet", "protein_distance_matrix_cdf1_5.npy")
    matrix_path_order = os.path.join(db_path, "geneSet", "order_distance_matrix_cdf1_5.npy")
    matrix_path_orientation = os.path.join(db_path, "geneSet", "orientation_distance_matrix_cdf1_5.npy")
    matrix_path_size = os.path.join(db_path, "geneSet", "size_distance_matrix_cdf1_5.npy")
    matrix_path_location = os.path.join(db_path, "geneSet", "location_distance_matrix_cdf1_5.npy")
    matrix_path_jaccard = os.path.join(db_path, "geneSet", "jaccard_distance_matrix_cdf1_5.npy")

    # Load sequences data.
    sequences = pd.read_csv(sequences_path)
    labels = sequences["sequence_id"].to_list()

    # Load data matrix
    data_matrix_proteins = np.load(matrix_path_proteins)
    data_matrix_order = np.load(matrix_path_order)
    data_matrix_orientation = np.load(matrix_path_orientation)
    data_matrix_size = np.load(matrix_path_size)
    data_matrix_location = np.load(matrix_path_location)
    data_matrix_jaccard = np.load(matrix_path_jaccard)

    
    
    # Create linkage matrix
    linkage_matrix = create_linkage_matrix(data_matrix_proteins, "ward")
    
    if request.method == "POST":

        # get scores and multiply with matrices
        protein_score = request.json["proteinScore"]/100
        order_score = request.json["orderScore"]/100
        orientation_score = request.json["orientationScore"]/100
        size_score = request.json["sizeScore"]/100
        location_score = request.json["locationScore"]/100
        jaccard_score = request.json["jaccardScore"]/100
        print('proteinScore', protein_score)
        print('orderScore', order_score)
        print('orientationScore', orientation_score)
        print('sizeScore', size_score)
        print('locationScore', location_score)
        print('jaccardScore', jaccard_score)

        matrix_proteins = protein_score * data_matrix_proteins
        matrix_order = order_score * data_matrix_order
        matrix_orientation = orientation_score * data_matrix_orientation
        matrix_size = size_score * data_matrix_size
        matrix_location = location_score * data_matrix_location
        matrix_jaccard = jaccard_score * data_matrix_jaccard

        list_matrices = [matrix_proteins, matrix_order, matrix_orientation, matrix_size, matrix_location, matrix_jaccard]

        matrix_combined = np.sum(list_matrices, axis=0)

        method = request.json["method"]
        methods = ["average", "complete", "single", "ward"]
        if method == None:
            linkage_method = "ward"
        else:
            linkage_method = methods[method]
        print("method", methods[method])

        # Create linkage matrix
        linkage_matrix = create_linkage_matrix(matrix_combined,  linkage_method)

    # Load linkage matrix
    sorting_dict = get_clustering_leaves(sequences, linkage_matrix, labels)


    json_object = json.dumps(sorting_dict, indent = 4) 

    return jsonify(sorting_dict)


if __name__ == "__main__":
    app.run()
