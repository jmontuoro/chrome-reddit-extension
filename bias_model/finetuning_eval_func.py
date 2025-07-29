import pandas as pd
import os
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from transformers import AutoModelForSequenceClassification, AutoConfig
from datasets import load_dataset
from datasets import Dataset
import torch
from transformers import Trainer
import evaluate
import numpy as np
from sklearn.metrics import accuracy_score, log_loss, classification_report
from sklearn.utils.class_weight import compute_class_weight
from torch.utils.data import DataLoader
from torch.nn import CrossEntropyLoss
from sklearn.model_selection import train_test_split
from sklearn.metrics import confusion_matrix

from typing import Dict, List, Tuple, Any
import matplotlib.pyplot as plt
import seaborn as sns
import json
import re
from tensorboard.backend.event_processing.event_accumulator import EventAccumulator


#for portabitliy on your local machine do:
#conda env export --no-builds > environment.yml
#on the vm do 
# conda env create -f environment.yml
# conda activate capstone-env
# conda install pytorch torchvision torchaudio pytorch-cuda=11.8 -c pytorch -c nvidia

import sys
print(sys.executable)




def create_eval_summary_df(dir_path):
    # Directory where your CSVs are stored
    csv_dir = dir_path #"/content/drive/MyDrive/capstone_2025/hatebert_logs/"

    csv_files = [f for f in os.listdir(dir_path) if "metrics" in f and f.endswith(".csv")]

    all_metrics = []
    print(f"Found {len(csv_files)} metric files in {csv_dir}")
    # List all metric CSV files
    for filename in csv_files:
        match = re.search(r"metrics_(.+)\.csv", filename)
        run_id = match.group(1) if match else None
        file_path = os.path.join(csv_dir, filename)
        df = pd.read_csv(file_path)

        # ✅ Only consider rows with real eval_accuracy values
        eval_rows = df[df['eval_accuracy'].notna()]

        if not eval_rows.empty:
            last_eval = eval_rows.iloc[-1]
            all_metrics.append({
                "run_id": run_id,
                "eval_loss": last_eval.get("eval_loss", None),
                "eval_accuracy": last_eval.get("eval_accuracy", None),
                "epoch": last_eval.get("epoch", None),
                "step": last_eval.get("step", None)
            })

    summary_df = pd.DataFrame(all_metrics)
    summary_df = summary_df.sort_values(by=["eval_accuracy"], ascending=False)
    return summary_df

def process_csv_social_bias(dir_path):
    # Load the CSV file into a DataFrame
    csv_file = os.path.join(dir_path, "social_bias.csv")
    df = pd.read_csv(csv_file)

    df['bias_type'].fillna('Neutral', inplace=True)
    ## TRAIN VAL TEST SPLITS

    # Set a seed for reproducibility
    RANDOM_SEED = 42

    # split into train (80%) and temp (20%)
    train_df, temp_df = train_test_split(df, test_size=0.2, random_state=RANDOM_SEED, stratify=df['bias_type'])

    # Split temp into validation (10%) and test (10%)
    val_df, test_df = train_test_split(temp_df, test_size=0.5, random_state=RANDOM_SEED, stratify=temp_df['bias_type'])

    print(f"Train size: {len(train_df)}")
    print(f"Validation size: {len(val_df)}")
    print(f"Test size: {len(test_df)}")


    # Encode the labels from 0 to 7
    bias_types = sorted(train_df['bias_type'].unique())  # sorted list for consistency
    label2id = {label: idx for idx, label in enumerate(bias_types)}
    id2label = {idx: label for label, idx in label2id.items()}

    for df in [train_df, val_df, test_df]:
        df['label'] = df['bias_type'].map(label2id)

    return train_df, val_df, test_df, label2id, id2label

def compute_class_weights(train_df, label2id):
    # Compute class weights
    class_weights = compute_class_weight(
        class_weight='balanced',
        classes=np.array(list(label2id.values())),
        y=train_df['label']
    )
    return torch.tensor(class_weights, dtype=torch.float)

# Custom Trainer with weighted loss
class WeightedTrainer(Trainer):
    def compute_loss(self, model, inputs, return_outputs=False,num_items_in_batch=None):
        labels = inputs.pop("labels")
        outputs = model(**inputs)
        logits = outputs.logits
        loss_fct = CrossEntropyLoss(weight=class_weight.to(model.device))
        loss = loss_fct(logits, labels)
        return (loss, outputs) if return_outputs else loss

def tokenize_function(examples):
    model_name = "GroNLP/hateBERT"
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    return tokenizer(examples["post"], padding="max_length", truncation=True)

# Define a custom collate function for the DataLoader
def custom_collate_fn(batch):
    # Select and collate only the necessary columns
    collated_batch = {}
    collated_batch['input_ids'] = torch.tensor([item['input_ids'] for item in batch], dtype=torch.long)
    collated_batch['attention_mask'] = torch.tensor([item['attention_mask'] for item in batch], dtype=torch.long)
    if 'label' in batch[0]: # Check if label exists in the first item
         collated_batch['labels'] = torch.tensor([item['label'] for item in batch], dtype=torch.long) # Note: model expects 'labels'

    return collated_batch

def load_csv_sweep_results_csv(dir_path, csv_filename="results.csv"):
    # Load the CSV file into a DataFrame
    csv_file = os.path.join(dir_path, csv_fileaname)
    df = pd.read_csv(csv_file)

    return df

def evaluation_report(df: pd.DataFrame):#this is the result of def load_csv_sweep_results_csv(dir_path, csv_filename="results.csv"):
    """returns a formated evaluation report string and overall accuracy, in a tuple along with the actual accuracy and repot"""
    """use like this formatted_result, accuracy, raw_report = evaluate_predictions(df)"""
    actual_bias_types = df['actual_bias_type']
    predicted_bias_types = df['predicted_bias_type']
    overall_accuracy = accuracy_score(actual_bias_types, predicted_bias_types)
    report_dict = classification_report(actual_bias_types, predicted_bias_types, output_dict=True)
    report=pd.DataFrame(report_dict).transpose()

    formatted_output = (
        f"\n📊 Evaluation Results\n"
        f"----------------------\n"
        f"✅ Overall Accuracy: {overall_accuracy:.2%}\n\n"
        f"📋 Classification Report:\n{report.to_string()}"
    )
    print(formatted_output)
    return overall_accuracy, report

def conf_matrix(df: pd.DataFrame, id2label: Dict[int, str], label2id: Dict[str, int]) -> pd.DataFrame:
    """
    Plots a confusion matrix heatmap and returns the confusion matrix as a DataFrame.

    Parameters:
    - df: DataFrame with 'actual_bias_type' and 'predicted_bias_type' columns.
    - id2label: Dictionary mapping numeric class IDs to label names they come from the process_csv_social_bias function.
    - label2id: Dictionary mapping label names to numeric class IDs.

    Returns:
    - A Pandas DataFrame representing the confusion matrix.
    """
    # Get class labels in the correct order
    labels = [id2label[i] for i in sorted(id2label.keys())]

    # Compute confusion matrix
    cm = confusion_matrix(df['actual_bias_type'], df['predicted_bias_type'], labels=labels)

    # Convert to DataFrame for nicer labeling
    cm_df = pd.DataFrame(cm, index=labels, columns=labels)

    # # Plot the heatmap
    # plt.figure(figsize=(10, 8))
    # sns.heatmap(cm_df, annot=True, fmt='d', cmap='Blues')
    # plt.xlabel('Predicted Bias Type')
    # plt.ylabel('Actual Bias Type')
    # plt.title('Confusion Matrix')
    # plt.tight_layout()
    #plt.show()

    return cm_df

