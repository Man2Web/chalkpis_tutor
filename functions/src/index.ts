import { setGlobalOptions } from 'firebase-functions/v2';

// All functions run in Mumbai (data residency + latency for Indian users).
setGlobalOptions({ region: 'asia-south1', maxInstances: 10 });

export {};
