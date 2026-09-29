# PART A: PROJECT RULES FILE

## Project
"An Intelligent System for Detecting Statistical Anomalies in Public Datasets": a decision-support platform for finding, explaining and validating statistically unusual records in public datasets (Census, MGNREGA, Election). Also the basis of an IEEE paper, so every claim must be backed by a reproducible experiment.

## Stack (fixed)
- Frontend: React (JavaScript), Tailwind CSS, React Router, Axios, Recharts, Lucide React. **No Vite.** Use react-scripts or custom Webpack. Env prefix `REACT_APP_`.
- Backend: Node.js, Express, Mongoose, JWT, bcrypt, Multer, Helmet, CORS, express-rate-limit, compression, Joi or express-validator.
- Database: MongoDB. **No PostgreSQL, Firebase or PHP.**
- ML service: Python 3, FastAPI, pandas, numpy, scipy, statsmodels, scikit-learn, shap, pyod (baselines only), matplotlib, pytest.
- Docker + Docker Compose at the end.

## Architecture
React → Node/Express → MongoDB, and Node → FastAPI (ML). The browser never calls Python. Node orchestrates jobs and stores all results. Heavy work runs as background jobs with states QUEUED / PROCESSING / COMPLETED / FAILED / CANCELLED and progress %.

## Folder structure
```
frontend/src/{components,pages,layouts,services,hooks,context,utils,charts}
backend/src/{config,controllers,middleware,models,routes,services,utils,validators,jobs}
ml-service/app/{api,core,preprocessing,schema_mapping,feature_engineering,peer_groups,
  anomaly_detection,calibration,forensics,explainability,validation,evaluation,experiments,utils}
data/{demo,processed,benchmarks}   tests/{frontend,backend,ml}   docs/paper
```

## Roles
ADMIN (everything), ANALYST (upload, process, detect, validate, report, experiments), REVIEWER (view, review, feedback). Protect every role-specific endpoint.

## API response format
`{ success, message, data, error }`

## Hard rules
1. No fake UI, hard-coded stats, or fake anomaly results. All numbers come from MongoDB or real ML output.
2. Never call any record, person, party or organization "fraud". Use "statistically unusual pattern", "potential anomaly", "requires human review". Anomaly is not fraud; the human reviewer decides.
3. The LLM is optional, grounded in an evidence bundle, and can never change anomaly scores. Without an LLM, use deterministic rule-based validation.
4. Label data everywhere as REAL, SYNTHETIC/DEMO, or BENCHMARK. Never claim accuracy on unlabeled real data.
5. Never expose secrets to the frontend. Secrets only in `.env`; keep `.env.example` updated.
6. Server-side pagination, filtering and sorting. Never load whole datasets into React or Node memory. Python processes large files in chunks.
7. Every experiment is seeded and reproducible. Store data hash, config hash, seed, model version.
8. Keep code modular (detectors, features, forensic tests and validation rules are registered classes). Avoid unnecessary dependencies.
9. Work incrementally. Keep the app runnable after every phase. Modify only the files a phase needs; do not regenerate existing files.
10. Write tests for each module as you build it, run them, and fix failures before finishing.

## Research contributions (names only; details come in phase prompts)
- C1 Calibrated Consensus Anomaly Score (conformal p-values, ACAT combination, BH/BY q-values)
- C2 Hierarchy-aware peer-group baselines (robust median/MAD, shrinkage, optional LISA)
- C3 Statistical forensics (Benford, last-digit, digit heaping, turnout vs vote-share)
- C4 Explanation faithfulness and stability (SHAP, DIFFI, deletion/insertion, Jaccard, Kendall tau, counterfactuals)
- C5 Grounded multi-agent validation with claim verifier
- C6 Human-in-the-loop adaptive detector weighting
- C7 Anomaly Triage Priority Index (ATPI)
- C8 Hash-chained tamper-evident audit log
- C9 Experiment Lab (injection, baselines, ablations, significance tests, LaTeX/figure export)

## Design
"Modern AI Governance & Data Intelligence Platform": clean SaaS look, rounded cards, subtle shadows, dark/light mode, responsive (sidebar on desktop, bottom nav on mobile), accessible contrast, loading skeletons, empty and error states, toasts.
