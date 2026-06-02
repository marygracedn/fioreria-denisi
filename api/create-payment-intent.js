const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  try {
    const { amount, currency = 'eur', description } = req.body;
    const amountNum = parseFloat(String(amount).replace(/[^0-9.]/g, '')) || 1;
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amountNum * 100),
      currency,
      description: description || 'Prenotazione',
      automatic_payment_methods: { enabled: true },
    });
    res.status(200).json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
