# Benchmark & Test Datasets: Accurate Baseline vs Anomaly Test Set

This folder contains paired datasets specifically created to test and demonstrate the **Intelligent System for Detecting Statistical Anomalies in Public Datasets**.

---

## 1. What Type of Dataset is Suitable for this Platform?

This platform is designed for **hierarchical, multi-dimensional public administrative datasets** with temporal and geographic attributes. The most suitable domain is **MGNREGA (National Rural Employment & Wages)** because it provides:

1. **Strict Administrative Hierarchy:** `state` $\rightarrow$ `district` $\rightarrow$ `block` $\rightarrow$ `gram_panchayat` (tests Contribution C2: Peer Group Shrinkage & local micro-cohort baseline vs global metrics).
2. **Time-Series Attributes:** `date`, `month`, `year` with agricultural seasonality (tests Temporal Drift & Seasonal Spike detection).
3. **Multi-dimensional Features:** `registered_workers`, `active_workers`, `workdays_generated`, `total_wages_paid_inr`, and `delayed_payment_days`.
4. **Relational Constraints:** 
   - `active_workers` $\le$ `registered_workers`
   - `total_wages_paid_inr` $\approx$ `workdays_generated` $\times$ statutory daily wage
5. **Natural Number Properties:** Values strictly follow Benford's Law (leading digit '1' appears ~30%) and smooth trailing digit uniformity (tests Contribution C3: Forensics).

---

## 2. Generated Paired Datasets

### A. Primary Recommendation: MGNREGA Dataset (500 Records)

| File Name | Purpose | Description |
| :--- | :--- | :--- |
| **`mgnrega_accurate_baseline.csv`** | **Accurate Values (Control / Baseline)** | 100% clean, realistic public records obeying statutory wage limits, seasonal demand, natural Benford digit laws, and relational arithmetic. Zero anomalies. |
| **`mgnrega_anomaly_test.csv`** | **Testing Dataset (Experiment)** | Identical structure to the baseline, but with **41 controlled statistical departures (8.2% anomaly rate)** injected across 6 distinct categories. |
| **`mgnrega_comparison_report.json`** | **Ground-Truth Comparison Diff** | Exact row-by-row mapping of every modified record, including original accurate value, injected value, anomaly category, and expected detector. |

### Injected Anomaly Categories in `mgnrega_anomaly_test.csv`:
1. **Extreme Point Outliers:** Massive wage or person-day explosions (e.g. 8x spike in `total_wages_paid_inr`). *Detected by Robust Z-Score / Isolation Forest.*
2. **Contextual Peer-Group Outliers:** Gram Panchayats reporting summer-peak employment in monsoon season compared to neighbors in the same district. *Detected by Hierarchy-Aware Peer Groups (C2).*
3. **Collective / Spatial Anomalies:** Clustered payment delays across an entire Panchayat. *Detected by Local Outlier Factor / Spatial MAD.*
4. **Temporal Drift & Sudden Spikes:** Level shifts breaking time-series continuity. *Detected by Temporal Z-Score.*
5. **Digit Manipulation & Benford Violations:** Artificial leading 9s or unnatural trailing zeroes (`000`). *Detected by Benford's Law & Digit Heaping Battery (C3).*
6. **Logical / Relational Contradictions:** Impossible arithmetic (`active_workers > registered_workers`). *Detected by Multi-Agent Domain Rule Agent & Claim Verifier (C5).*

---

### B. Secondary Option: Census Demographic Dataset (81 Records)

| File Name | Purpose | Description |
| :--- | :--- | :--- |
| **`census_accurate_baseline.csv`** | **Accurate Baseline** | Consistent demographic decadal census counts (`total_population = male + female`, households, literacy). |
| **`census_anomaly_test.csv`** | **Anomaly Test Set** | Injected demographic anomalies (sex ratio inversion, arithmetic imbalance `females > total_population`, extreme population spikes). |
| **`census_comparison_report.json`** | **Comparison Diff** | Row-by-row ground truth audit report. |

---

## 3. How to Test Them in the Platform

1. **Start the Platform:**
   - Terminal 1: `cd ml-service && python -m uvicorn app.main:app --port 8000 --reload`
   - Terminal 2: `cd backend && npm run dev`
   - Terminal 3: `cd frontend && npm start`
2. **Log In:** Navigate to [http://localhost:3000](http://localhost:3000) and log in as Analyst (`analyst@anomalydetection.internal` / `AnalystPassword@123`) or Admin.
3. **Upload the Baseline Dataset:**
   - Go to **Datasets (`/datasets`)** $\rightarrow$ Click **"Upload Dataset"**.
   - Select `data/test_samples/mgnrega_accurate_baseline.csv`. Set Category to **MGNREGA** and Type to **REAL / BENCHMARK**.
   - Run Detection $\rightarrow$ Observe: **0 anomalies flagged**, clean conformal p-values, high forensic conformity!
4. **Upload the Anomaly Test Dataset:**
   - Upload `data/test_samples/mgnrega_anomaly_test.csv`. Set Type to **SYNTHETIC/DEMO**.
   - Run Detection $\rightarrow$ Observe:
     - **Anomalies Page (`/anomalies`):** Flags the exact injected records with high ATPI scores.
     - **Forensics Page (`/forensics`):** Benford's Law test flags suspicious leading digits and digit heaping on `total_wages_paid_inr`.
     - **Explainability Page (`/explainability`):** SHAP plots clearly show which feature caused the flag, and counterfactuals show how to return to nominal baseline.
     - **Review Queue (`/reviews`):** Multi-agent validation catches logical contradictions (`active_workers > registered_workers`).
