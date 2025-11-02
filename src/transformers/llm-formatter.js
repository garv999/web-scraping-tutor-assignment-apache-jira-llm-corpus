// Compatibility shim
// This file previously contained an exporter specialized for producing
// training JSONL files. The implementation was moved to
// `text-formatter.js` to use a more neutral name and avoid tool-specific
// terminology. Re-export the implementation here for backward compatibility.

export * from './text-formatter.js';
