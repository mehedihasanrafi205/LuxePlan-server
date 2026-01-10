/**
 * Mock SMS Sender
 * In production, replace this with Twilio or similar service.
 */
const sendSMS = (recipient, message) => {
  console.log(`\n[SMS MOCK] To: ${recipient}`);
  console.log(`[SMS MOCK] Body: ${message}\n`);
  return Promise.resolve(true); // Simulate async API call
};

module.exports = { sendSMS };
