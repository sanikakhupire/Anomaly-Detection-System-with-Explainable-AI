const experimentService = require('../services/experiment.service');

/**
 * Controller for Experiment Lab (Contribution C9)
 */
const createRun = async (req, res) => {
  try {
    const { name, domain, nRecords, severity, seed, nRepetitions, datasetId } = req.body;

    const expRun = await experimentService.createExperimentRun({
      user: req.user,
      name,
      domain,
      nRecords,
      severity,
      seed,
      nRepetitions,
      datasetId,
    });

    return res.status(201).json({
      success: true,
      message: 'Benchmark experiment run initialized and queued',
      data: expRun,
    });
  } catch (error) {
    console.error('Error creating experiment run:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create experiment run',
      error: error.message,
    });
  }
};

const getRuns = async (req, res) => {
  try {
    const { page, limit, domain, status } = req.query;
    const data = await experimentService.getExperimentRuns({
      page,
      limit,
      domain,
      status,
    });

    return res.status(200).json({
      success: true,
      message: 'Experiment runs retrieved successfully',
      data,
    });
  } catch (error) {
    console.error('Error fetching experiment runs:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve experiment runs',
      error: error.message,
    });
  }
};

const getRunById = async (req, res) => {
  try {
    const { id } = req.params;
    const run = await experimentService.getExperimentRunById(id);

    return res.status(200).json({
      success: true,
      message: 'Experiment run retrieved successfully',
      data: run,
    });
  } catch (error) {
    console.error('Error fetching experiment run:', error);
    return res.status(404).json({
      success: false,
      message: error.message || 'Experiment run not found',
      error: error.message,
    });
  }
};

const exportLatex = async (req, res) => {
  try {
    const { id } = req.params;
    const latexContent = await experimentService.exportExperimentLatex(id);

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="experiment_tables_${id}.tex"`
    );
    return res.status(200).send(latexContent);
  } catch (error) {
    console.error('Error exporting experiment LaTeX:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to export experiment LaTeX tables',
      error: error.message,
    });
  }
};

module.exports = {
  createRun,
  getRuns,
  getRunById,
  exportLatex,
};
