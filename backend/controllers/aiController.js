exports.chat = (req, res) => {
  const { message } = req.body;
  const lowerMsg = (message || '').toLowerCase();

  let reply = "I'm not sure about that. Try asking about 'budget', 'venues', or 'ideas'.";

  if (lowerMsg.includes('hello') || lowerMsg.includes('hi')) {
    reply = "Hello! I'm your Event AI Assistant. How can I help you plan your next big event?";
  } else if (lowerMsg.includes('budget')) {
    reply = "For budgeting, I recommend the 50-30-20 rule: 50% for Venue/Food, 30% for Decor/Entertainment, and 20% for unexpected costs. What's your total budget?";
  } else if (lowerMsg.includes('recommend') || lowerMsg.includes('suggestion')) {
    reply = "Based on current trends, 'Boho Chic' weddings and 'Tech Minimalist' conferences are very popular. What type of event are you hosting?";
  } else if (lowerMsg.includes('venue') || lowerMsg.includes('place')) {
    reply = "We have several great venues! 'Grand Plaza' for large weddings (500+), and 'Tech Hub' for corporate meets. Check the 'Book Event' page for availability.";
  }

  setTimeout(() => {
    res.json({ reply });
  }, 800);
};
