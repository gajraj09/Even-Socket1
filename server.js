// server.js
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const mongoose = require("mongoose");
const path = require("path");
const axios = require("axios");
require("dotenv").config();

const Trend = require("./models/Trend");

const app = express();
const cors = require("cors");
app.use(cors());
const server = http.createServer(app);
app.use(express.static(path.join(__dirname, "public")));

const mongoUri = process.env.MONGODB_URI;
mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

// -----------------------
// State Variables
// -----------------------
let state = {
  live: "0",
  trend10m: "",
  trend1m: "",
};

let lastTrendMinute1m = null;
let lastTrendMinute10m = null;
let trendString10m = "";
let trendString1m = "";

// -----------------------
// Utility Functions
// -----------------------
async function fetchLatestTrends() {
  try {
    const date = new Date().toISOString().split("T")[0];
    const trendEntry = await Trend.findOne({ date });
    if (trendEntry) {
      trendString10m = trendEntry.trend || "";
      trendString1m = trendEntry.trend2 || "";
    } else {
      trendString10m = "";
      trendString1m = "";
    }
  } catch (error) {
    console.error("Error fetching latest trends:", error);
    trendString10m = "";
    trendString1m = "";
  }
}

async function saveTrendToDB({ trendType, value }) {
  const date = new Date().toISOString().split("T")[0];
  try {
    let trendEntry = await Trend.findOne({ date });
    if (trendEntry) {
      trendEntry[trendType] = value;
    } else {
      trendEntry = new Trend({ date, [trendType]: value });
    }
    await trendEntry.save();
    await fetchLatestTrends();
  } catch (error) {
    console.error(`Error saving ${trendType} to DB:`, error);
  }
}

// -----------------------
// WebSocket Connections
// -----------------------
function connectWebSocket(url, onMessage) {
  const ws = new WebSocket(url);

  ws.on("open", () => console.log(`Connected to ${url}`));
  ws.on("message", onMessage);
  ws.on("error", (err) => {
    console.error("WebSocket error:", err);
    setTimeout(() => connectWebSocket(url, onMessage), 5000);
  });
  ws.on("close", () => {
    console.warn("WebSocket closed. Reconnecting...");
    setTimeout(() => connectWebSocket(url, onMessage), 5000);
  });

  return ws;
}

// -----------------------
// Binance WebSocket Handlers
// -----------------------
connectWebSocket("wss://stream.binance.com:9443/ws/btcusdt@trade", (event) => {
  try {
    const data = JSON.parse(event);
    state.live = parseFloat(data.p).toFixed(2);
  } catch (error) {
    console.error("Error parsing live trade data:", error);
  }
});

connectWebSocket("wss://stream.binance.com:9443/ws/btcusdt@kline_1m", async (event) => {
  try {
    const data = JSON.parse(event);
    const open = parseFloat(data.k.o).toFixed(2);
    const close = parseFloat(data.k.c).toFixed(2);
    const minute = new Date(parseInt(data.k.t)).getMinutes();

    if (lastTrendMinute1m !== minute) {
      lastTrendMinute1m = minute;
      const direction = close >= open ? "H" : "L";
      state.trend1m += direction;
      await saveTrendToDB({ trendType: "trend2", value: state.trend1m });
    }
  } catch (error) {
    console.error("Error handling 1m kline:", error);
  }
});

connectWebSocket("wss://stream.binance.com:9443/ws/btcusdt@kline_5m", async (event) => {
  try {
    const data = JSON.parse(event);
    const open = parseFloat(data.k.o).toFixed(2);
    const close = parseFloat(data.k.c).toFixed(2);
    const minute = new Date(parseInt(data.k.t)).getMinutes();

    if (minute % 10 === 0 && lastTrendMinute10m !== minute) {
      lastTrendMinute10m = minute;
      const direction = close >= open ? "H" : "L";
      state.trend10m += direction;
      await saveTrendToDB({ trendType: "trend", value: state.trend10m });
    }
  } catch (error) {
    console.error("Error handling 5m kline:", error);
  }
});

// -----------------------
// Routes
// -----------------------
app.get("/", (req, res) => {
  res.send(`Server is Live Now`);
});

app.get("/price", (req, res) => {
  res.json({
    live: state.live,
    trend10min: trendString10m,
    trend1min: trendString1m,
  });
});

app.get("/callback-from-server2", (req, res) => {
  res.send("Hello from Server 1!");
});

// -----------------------
// Cross-server Ping
// -----------------------
const callServer2 = () => {
  setInterval(async () => {
    try {
      await axios.get("https://odd-reviver.onrender.com/callback-from-server1");
    } catch (error) {
      console.error("Error calling Server 2:", error.message);
    }
  }, 300000); // every 5 minutes
};

// -----------------------
// Server Start
// -----------------------
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  callServer2();
  console.log(`Server running on port ${PORT}`);
});


// const express = require("express");
// const http = require("http");
// const WebSocket = require("ws");
// const mongoose = require("mongoose");
// const path = require("path");
// const axios = require("axios");
// require("dotenv").config();

// const Trend = require("./models/Trend");

// const app = express();
// const cors = require("cors");
// app.use(cors());
// const server = http.createServer(app);
// app.use(express.static(path.join(__dirname, "public")));

// const mongoUri = process.env.MONGODB_URI;
// mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

// // -----------------------
// // State Variables
// // -----------------------
// let state = {
//   live: "0",
//   trend10m: "",
//   trend1m: "",
//   prices: {
//     prev10m: "0",
//     curr10m: "",
//     prev1m: "0",
//     curr1m: "0",
//   },
//   clocks: {
//     clock10m: 0,
//     clock1m: 0,
//   },
//   time: {
//     minute: 0,
//     second: 0,
//   },
// };

// let lastTrendMinute1m = null;
// let lastTrendMinute10m = null;

// // -----------------------
// // Utility Functions
// // -----------------------
// function updateTime() {
//   const now = new Date();
//   state.time.minute = now.getMinutes();
//   state.time.second = now.getSeconds();
// }

// let trendString10m = "";
// let trendString1m = "";

// async function fetchLatestTrends() {
//   try {
//     const date = new Date().toISOString().split("T")[0];
//     const trendEntry = await Trend.findOne({ date });
//     if (trendEntry) {
//       trendString10m = trendEntry.trend || "";
//       trendString1m = trendEntry.trend2 || "";
//     } else {
//       trendString10m = "";
//       trendString1m = "";
//     }
//   } catch (error) {
//     console.error("Error fetching latest trends:", error);
//     trendString10m = "";
//     trendString1m = "";
//   }
// }

// async function saveTrendToDB({ trendType, value }) {
//   const date = new Date().toISOString().split("T")[0];
//   try {
//     let trendEntry = await Trend.findOne({ date });

//     if (trendEntry) {
//       trendEntry[trendType] = value;
//     } else {
//       trendEntry = new Trend({ date, [trendType]: value });
//     }

//     await trendEntry.save();
//     await fetchLatestTrends();
//   } catch (error) {
//     console.error(`Error saving ${trendType} to DB:`, error);
//   }
// }

// // -----------------------
// // WebSocket Connections
// // -----------------------
// function connectWebSocket(url, onMessage) {
//   const ws = new WebSocket(url);

//   ws.on("open", () => console.log(`Connected to ${url}`));
//   ws.on("message", onMessage);
//   ws.on("error", (err) => {
//     console.error("WebSocket error:", err);
//     setTimeout(() => connectWebSocket(url, onMessage), 5000);
//   });
//   ws.on("close", () => {
//     console.warn("WebSocket closed. Reconnecting...");
//     setTimeout(() => connectWebSocket(url, onMessage), 5000);
//   });

//   return ws;
// }

// // -----------------------
// // Binance WebSocket Handlers
// // -----------------------
// connectWebSocket("wss://stream.binance.com:9443/ws/btcusdt@trade", (event) => {
//   try {
//     const data = JSON.parse(event);
//     state.live = parseFloat(data.p).toFixed(2);
//   } catch (error) {
//     console.error("Error parsing live trade data:", error);
//   }
// });

// connectWebSocket("wss://stream.binance.com:9443/ws/btcusdt@kline_1m", async (event) => {
//   try {
//     updateTime();
//     const data = JSON.parse(event);
//     const open = parseFloat(data.k.o).toFixed(2);
//     const { minute, second } = state.time;

//     if (minute % 10 === 0 && second >= 3 && state.clocks.clock1m === 0) {
//       state.clocks.clock1m = 1;
//       state.prices.prev1m = open;
//     }

//     if (
//       minute % 10 === 1 &&
//       second >= 3 &&
//       state.clocks.clock1m === 1 &&
//       lastTrendMinute1m !== minute
//     ) {
//       lastTrendMinute1m = minute;
//       state.clocks.clock1m = 2;
//       state.prices.curr1m = open;

//       if (state.prices.curr1m !== state.prices.prev1m) {
//         const direction = state.prices.curr1m >= state.prices.prev1m ? "H" : "L";
//         state.trend1m += direction;

//         setTimeout(() => {
//           saveTrendToDB({ trendType: "trend2", value: state.trend1m });
//         }, 1000);
//       }
//     }

//     if (minute % 10 >= 2) {
//       state.clocks.clock1m = 0;
//     }
//   } catch (error) {
//     console.error("Error handling 1m kline:", error);
//   }
// });

// connectWebSocket("wss://stream.binance.com:9443/ws/btcusdt@kline_5m", async (event) => {
//   try {
//     updateTime();
//     const data = JSON.parse(event);
//     const open = parseFloat(data.k.o).toFixed(2);
//     const { minute, second } = state.time;

//     if (state.prices.prev10m === "0") {
//       state.prices.prev10m = open;
//     }

//     if (
//       minute % 10 === 0 &&
//       second >= 3 &&
//       state.clocks.clock10m === 0 &&
//       lastTrendMinute10m !== minute
//     ) {
//       lastTrendMinute10m = minute;
//       state.clocks.clock10m = 1;
//       state.prices.curr10m = open;

//       if (state.prices.curr10m !== state.prices.prev10m) {
//         const direction = state.prices.curr10m >= state.prices.prev10m ? "H" : "L";
//         state.trend10m += direction;
//         state.prices.prev10m = state.prices.curr10m;

//         setTimeout(() => {
//           saveTrendToDB({ trendType: "trend", value: state.trend10m });
//         }, 2000);
//       }
//     }

//     // Reset clock10m safely in the next few minutes
//     if (minute % 10 >= 2) {
//       state.clocks.clock10m = 0;
//     }
//   } catch (error) {
//     console.error("Error handling 5m kline:", error);
//   }
// });

// // -----------------------
// // Routes
// // -----------------------
// app.get("/", (req, res) => {
//   res.send(`Server is Live Now`);
// });

// app.get("/price", (req, res) => {
//   res.json({
//     live: state.live,
//     previous_price: state.prices.prev10m,
//     current_price: state.prices.curr10m,
//     trend10min: trendString10m,
//     trend1min: trendString1m,
//   });
// });

// app.get("/callback-from-server2", (req, res) => {
//   res.send("Hello from Server 1!");
// });

// const callServer2 = () => {
//   setInterval(async () => {
//     try {
//       await axios.get("https://odd-reviver.onrender.com/callback-from-server1");
//     } catch (error) {
//       console.error("Error calling Server 2:", error.message);
//     }
//   },300000); // every 10 minutes
// };

// // -----------------------
// // Server Start
// // -----------------------
// const PORT = process.env.PORT || 5000;
// server.listen(PORT, () => {
//   setInterval(updateTime, 1000); // keep state.time fresh
//   callServer2();
//   console.log(`Server running on port ${PORT}`);
// });



// const express = require("express");
// const http = require("http");
// const WebSocket = require("ws");
// const mongoose = require("mongoose");
// const path = require("path");
// const axios = require("axios");
// require("dotenv").config();

// const Trend = require("./models/Trend");

// const app = express();
// const cors = require("cors");
// app.use(cors());
// const server = http.createServer(app);
// app.use(express.static(path.join(__dirname, "public")));

// const mongoUri = process.env.MONGODB_URI;
// mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

// // -----------------------
// // State Variables
// // -----------------------
// let state = {
//   live: "0",
//   trend10m: "",
//   trend1m: "",
//   prices: {
//     prev10m: "0",
//     curr10m: "",
//     prev1m: "0",
//     curr1m: "0",
//   },
//   clocks: {
//     clock10m: 0,
//     clock1m: 0,
//   },
//   time: {
//     minute: 0,
//     second: 0,
//   },
// };

// // -----------------------
// // Utility Functions
// // -----------------------
// function updateTime() {
//   const now = new Date();
//   state.time.minute = now.getMinutes();
//   state.time.second = now.getSeconds();
// }

// let trendString10m = "";
// let trendString1m = "";

// async function fetchLatestTrends() {
//   try {
//     const date = new Date().toISOString().split("T")[0];
//     const trendEntry = await Trend.findOne({ date });
//     if (trendEntry) {
//       trendString10m = trendEntry.trend || "";
//       trendString1m = trendEntry.trend2 || "";
//     } else {
//       trendString10m = "";
//       trendString1m = "";
//     }
//   } catch (error) {
//     console.error("Error fetching latest trends:", error);
//     trendString10m = "";
//     trendString1m = "";
//   }
// }

// async function saveTrendToDB({ trendType, value }) {
//   const date = new Date().toISOString().split("T")[0];
//   try {
//     let trendEntry = await Trend.findOne({ date });

//     if (trendEntry) {
//       trendEntry[trendType] = value;
//     } else {
//       trendEntry = new Trend({ date, [trendType]: value });
//     }

//     await trendEntry.save();
//     await fetchLatestTrends();
//   } catch (error) {
//     console.error(`Error saving ${trendType} to DB:`, error);
//   }
// }

// // -----------------------
// // WebSocket Connections
// // -----------------------
// function connectWebSocket(url, onMessage) {
//   const ws = new WebSocket(url);

//   ws.on("open", () => console.log(`Connected to ${url}`));
//   ws.on("message", onMessage);
//   ws.on("error", (err) => {
//     console.error("WebSocket error:", err);
//     setTimeout(() => connectWebSocket(url, onMessage), 5000);
//   });
//   ws.on("close", () => {
//     console.warn("WebSocket closed. Reconnecting...");
//     setTimeout(() => connectWebSocket(url, onMessage), 5000);
//   });

//   return ws;
// }

// // -----------------------
// // Binance WebSocket Handlers
// // -----------------------
// connectWebSocket("wss://stream.binance.com:9443/ws/btcusdt@trade", (event) => {
//   try {
//     const data = JSON.parse(event);
//     state.live = parseFloat(data.p).toFixed(2);
//   } catch (error) {
//     console.error("Error parsing live trade data:", error);
//   }
// });

// connectWebSocket("wss://stream.binance.com:9443/ws/btcusdt@kline_1m", async (event) => {
//   try {
//     updateTime();
//     const data = JSON.parse(event);
//     const open = parseFloat(data.k.o).toFixed(2);
//     const { minute, second } = state.time;

//     if (minute % 10 === 0 && second >= 3 && state.clocks.clock1m === 0) {
//       state.clocks.clock1m = 1;
//       state.prices.prev1m = open;
//     }

//     if (minute % 10 === 1 && second >= 3 && state.clocks.clock1m === 1) {
//       state.clocks.clock1m = 2;
//       state.prices.curr1m = open;

//       if (state.prices.curr1m !== state.prices.prev1m) {
//         const direction = state.prices.curr1m >= state.prices.prev1m ? "H" : "L";
//         state.trend1m += direction;

//         // Use a small delay to avoid conflict with 10m save
//         setTimeout(() => {
//           saveTrendToDB({ trendType: "trend2", value: state.trend1m });
//         }, 1000); // 1 second delay
//       }
//     }

//     // Reset logic (handles drift better)
//     if (minute % 10 > 5) {
//       state.clocks.clock1m = 0;
//     }
//   } catch (error) {
//     console.error("Error handling 1m kline:", error);
//   }
// });

// connectWebSocket("wss://stream.binance.com:9443/ws/btcusdt@kline_5m", async (event) => {
//   try {
//     updateTime();
//     const data = JSON.parse(event);
//     const open = parseFloat(data.k.o).toFixed(2);
//     const { minute, second } = state.time;

//     if (state.prices.prev10m === "0") {
//       state.prices.prev10m = open;
//     }

//     if (minute % 10 === 0 && second >= 3 && state.clocks.clock10m === 0) {
//       state.clocks.clock10m = 1;
//       state.prices.curr10m = open;

//       if (state.prices.curr10m !== state.prices.prev10m) {
//         const direction = state.prices.curr10m >= state.prices.prev10m ? "H" : "L";
//         state.trend10m += direction;
//         state.prices.prev10m = state.prices.curr10m;

//         // Save with a slight delay to prevent overlap with 1m
//         setTimeout(() => {
//           saveTrendToDB({ trendType: "trend", value: state.trend10m });
//         }, 2000); // 2 seconds delay
//       }
//     }

//     if (minute % 10 > 6) {
//       state.clocks.clock10m = 0;
//     }
//   } catch (error) {
//     console.error("Error handling 5m kline:", error);
//   }
// });

// // -----------------------
// // Routes
// // -----------------------
// app.get("/", (req, res) => {
//   res.send(`Server is Live Now`);
// });

// app.get("/price", (req, res) => {
//   res.json({
//     live: state.live,
//     previous_price: state.prices.prev10m,
//     current_price: state.prices.curr10m,
//     trend10min: trendString10m,
//     trend1min: trendString1m,
//   });
// });

// app.get("/callback-from-server2", (req, res) => {
//   res.send("Hello from Server 1!");
// });

// const callServer2 = () => {
//   setInterval(async () => {
//     try {
//       const response = await axios.get("https://odd-reviver.onrender.com/callback-from-server1");
//     } catch (error) {
//       console.error("Error calling Server 2:", error.message);
//     }
//   }, 600000); // 10 minutes
// };

// // -----------------------
// // Server Start
// // -----------------------
// const PORT = process.env.PORT || 5000;
// server.listen(PORT, () => {
//   setInterval(updateTime, 1000); // keep state.time fresh
//   callServer2();
//   console.log(`Server running on port ${PORT}`);
// });
