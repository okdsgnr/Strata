const { getWalletLabels } = require('./db.js');

async function getLabelsForHolders(holders) {
  const addresses = holders.map(h => h.owner);
  const labels = await getWalletLabels(addresses);
  
  // Create a map for quick lookup
  const labelMap = new Map();
  labels.forEach(label => {
    labelMap.set(label.address, { type: label.type, label: label.label });
  });
  
  return labelMap;
}

function filterExcludedHolders(holders, labelMap) {
  return holders.filter(h => {
    const label = labelMap.get(h.owner);
    return !label || !['CEX', 'LP'].includes(label.type);
  });
}

function getCanonicalLabel(address, labelMap) {
  const label = labelMap.get(address);
  return label ? label.label : null;
}

module.exports = {
  getLabelsForHolders,
  filterExcludedHolders,
  getCanonicalLabel
};
