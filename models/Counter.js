const mongoose = require("mongoose");

// Tiny sequence generator used to mint human-readable ticket numbers
// (e.g. "VC-1042"). Use via:
// Counter.findOneAndUpdate({_id: name}, {$inc:{seq:1}}, {upsert:true, new:true})
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

module.exports = mongoose.model("Counter", counterSchema);
