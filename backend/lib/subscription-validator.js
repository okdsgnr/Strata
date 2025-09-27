const VALID_PLANS = ['monthly', 'annual', 'lifetime'];
const VALID_STATUSES = ['active', 'expired', 'canceled'];

function isValidUUID(uuid) {
  // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  // where x is any hexadecimal digit and y is 8, 9, a, or b
  const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidV4Regex.test(uuid);
}

function validateSubscriptionData(data) {
  const errors = [];

  // Check required fields
  const requiredFields = ['user_id', 'plan', 'status'];
  for (const field of requiredFields) {
    if (!data[field]) {
      errors.push(`${field} is required`);
    }
  }

  // Validate plan enum
  if (data.plan && !VALID_PLANS.includes(data.plan)) {
    errors.push(`Invalid plan: ${data.plan}. Must be one of: ${VALID_PLANS.join(', ')}`);
  }

  // Validate status enum
  if (data.status && !VALID_STATUSES.includes(data.status)) {
    errors.push(`Invalid status: ${data.status}. Must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  // Validate UUID format for user_id
  if (data.user_id && !isValidUUID(data.user_id)) {
    errors.push('user_id must be a valid UUID');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

function calculateExpiryDate(plan, startDate = new Date()) {
  console.log('Calculating expiry date for plan:', plan);
  
  switch (plan) {
    case 'monthly':
      return new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    case 'annual':
      return new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000);
    case 'lifetime':
      return null;
    default:
      throw new Error(`Invalid plan: ${plan}`);
  }
}

function formatSubscriptionData(data) {
  console.log('Formatting subscription data:', data);
  const now = new Date().toISOString();
  
  return {
    user_id: data.user_id,
    plan: data.plan,
    status: data.status,
    tx_signature: data.tx_signature,
    start_date: data.start_date || now,
    expiry_date: data.expiry_date || calculateExpiryDate(data.plan),
    created_at: now,
    updated_at: now
  };
}

module.exports = {
  validateSubscriptionData,
  formatSubscriptionData,
  calculateExpiryDate,
  VALID_PLANS,
  VALID_STATUSES
};