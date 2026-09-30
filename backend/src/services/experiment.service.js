const ExperimentRun = require('../models/ExperimentRun');
const Dataset = require('../models/Dataset');
const mlService = require('./ml.service');
const auditLedgerService = require('./auditLedger.service');

class ExperimentService {
  /**
   * Creates an experiment run record and launches background execution (Contribution C9)
   */
  async createExperimentRun({
    user,
    name,
    domain = 'MGNREGA',
    nRecords = 300,
    severity = 'medium',
    seed = 42,
    nRepetitions = 5,
    datasetId = null,
  }) {
    let dataset = null;
    let dataType = 'SYNTHETIC/DEMO';

    if (datasetId) {
      dataset = await Dataset.findById(datasetId);
      if (!dataset) {
        throw new Error('Referenced dataset not found');
      }
      dataType = dataset.dataType || 'REAL';
    }

    const expRun = new ExperimentRun({
      name: name || `${domain} Benchmark Run (Seed ${seed})`,
      domain,
      dataset: dataset ? dataset._id : null,
      dataType,
      seed: Number(seed),
      nRepetitions: Number(nRepetitions),
      severity,
      status: 'QUEUED',
      progress: 0,
      createdBy: user?._id || user || null,
    });

    await expRun.save();

    // Trigger async background execution
    setImmediate(() => {
      this.executeExperimentRun(expRun._id, { nRecords, severity }).catch((err) => {
        console.error(`Experiment run ${expRun._id} failed in background:`, err);
      });
    });

    return expRun;
  }

  /**
   * Executes the benchmark experiment pipeline
   */
  async executeExperimentRun(experimentId, options = {}) {
    const startTime = Date.now();
    const expRun = await ExperimentRun.findById(experimentId);
    if (!expRun) return;

    try {
      expRun.status = 'PROCESSING';
      expRun.progress = 15;
      await expRun.save();

      const payload = {
        domain: expRun.domain,
        n_records: options.nRecords || 300,
        severity: expRun.severity || 'medium',
        seed: expRun.seed || 42,
        n_repetitions: expRun.nRepetitions || 5,
      };

      if (expRun.dataset) {
        const ds = await Dataset.findById(expRun.dataset);
        if (ds) {
          payload.dataset_name = ds.name;
          payload.data_type = ds.dataType;
        }
      }

      expRun.progress = 35;
      await expRun.save();

      // Call Python ML service benchmark runner
      const mlResponse = await mlService.runBenchmark(payload);
      const data = mlResponse.data || {};

      expRun.progress = 85;

      const executionTimeMs = Date.now() - startTime;
      expRun.totalRecords = data.total_records || 0;
      expRun.groundTruthAnomalies = data.ground_truth_anomalies || 0;
      expRun.baselineSummary = data.baseline_summary || {};
      expRun.ablationSummary = data.ablation_summary || [];
      expRun.significanceTests = data.significance_tests || [];
      expRun.latexTables = {
        benchmarkTable:
          data.latex_tables?.benchmark_table ||
          data.latex_tables?.benchmarkTable ||
          '',
        ablationTable:
          data.latex_tables?.ablation_table ||
          data.latex_tables?.ablationTable ||
          '',
        significanceTable:
          data.latex_tables?.significance_table ||
          data.latex_tables?.significanceTable ||
          '',
      };

      if (data.reproducibility) {
        expRun.dataHash = data.reproducibility.data_hash;
        expRun.configHash = data.reproducibility.config_hash;
        expRun.modelVersion = data.reproducibility.model_version;
      }

      expRun.executionTimeMs = executionTimeMs;
      expRun.status = 'COMPLETED';
      expRun.progress = 100;
      await expRun.save();

      // Append into cryptographic hash-chained audit ledger (Contribution C8)
      try {
        await auditLedgerService.logAction({
          user: expRun.createdBy,
          action: 'EXPERIMENT_BENCHMARK_COMPLETED',
          entity: 'ExperimentRun',
          entityId: expRun._id,
          metadata: {
            experimentName: expRun.name,
            domain: expRun.domain,
            seed: expRun.seed,
            nRepetitions: expRun.nRepetitions,
            dataHash: expRun.dataHash,
            configHash: expRun.configHash,
            executionTimeMs,
          },
        });
      } catch (auditErr) {
        console.error('Failed to log experiment to audit ledger:', auditErr);
      }

      return expRun;
    } catch (err) {
      console.error(`Error in executeExperimentRun ${experimentId}:`, err);
      expRun.status = 'FAILED';
      expRun.errorMessage = err.message;
      expRun.progress = 0;
      await expRun.save();
      throw err;
    }
  }

  /**
   * Retrieves paginated experiment runs with server-side filtering
   */
  async getExperimentRuns({ page = 1, limit = 20, domain, status }) {
    const query = {};
    if (domain) query.domain = domain;
    if (status) query.status = status;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [runs, total] = await Promise.all([
      ExperimentRun.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('dataset', 'name category dataType')
        .populate('createdBy', 'name email role')
        .lean(),
      ExperimentRun.countDocuments(query),
    ]);

    return {
      runs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    };
  }

  /**
   * Retrieves single experiment run by ID
   */
  async getExperimentRunById(id) {
    const run = await ExperimentRun.findById(id)
      .populate('dataset', 'name category dataType dataHash')
      .populate('createdBy', 'name email role')
      .lean();

    if (!run) {
      throw new Error('Experiment run not found');
    }
    return run;
  }

  /**
   * Exports IEEE LaTeX tables bundle for the experiment run
   */
  async exportExperimentLatex(id) {
    const run = await this.getExperimentRunById(id);
    const tables = run.latexTables || {};

    const header = `% ====================================================================\n% IEEE Publication Tables: ${run.name}\n% Domain: ${run.domain} | Seed: ${run.seed} | Repetitions: ${run.nRepetitions}\n% Model Version: ${run.modelVersion} | Data Hash: ${run.dataHash || 'N/A'}\n% Generated by Intelligent Statistical Anomaly Detection Platform\n% ====================================================================\n\n`;

    const content = [
      header,
      '% Table 1: Benchmark Comparison vs Baselines',
      tables.benchmarkTable || '% No benchmark table available',
      '\n\n',
      '% Table 2: Ablation Analysis of Proposed Contributions',
      tables.ablationTable || '% No ablation table available',
      '\n\n',
      '% Table 3: Pairwise Statistical Significance Tests',
      tables.significanceTable || '% No significance table available',
    ].join('\n');

    return content;
  }
}

module.exports = new ExperimentService();
