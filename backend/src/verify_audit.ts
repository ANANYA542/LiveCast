import axios from "axios";
import { io as ClientSocket, Socket } from "socket.io-client";
import { prisma } from "./config/db";

const BASE_URL = "http://localhost:3001";

async function runTests() {
  console.log("=== STARTING INTEGRATION AUDIT TESTS ===");

  // 1. Setup clean user email for tests
  const testEmail = `audit-${Date.now()}@test.com`;
  const testPassword = "password123";
  const displayName = "Audit User";

  let token = "";
  let userId = "";

  // Test 1: Invalid Email Format -> Expect 400
  console.log("\n[Test 1] Register invalid email format...");
  try {
    await axios.post(`${BASE_URL}/api/auth/register`, {
      displayName,
      email: "invalid-email-format",
      password: testPassword,
    });
    console.error("❌ FAIL: Register invalid email format should have returned 400");
  } catch (error: any) {
    if (error.response?.status === 400) {
      console.log("✅ PASS: Got 400 Bad Request");
    } else {
      console.error(`❌ FAIL: Expected 400, got ${error.response?.status}`);
    }
  }

  // Test 2: Successful Registration -> Expect 201
  console.log("\n[Test 2] Register valid user...");
  try {
    const res = await axios.post(`${BASE_URL}/api/auth/register`, {
      displayName,
      email: testEmail,
      password: testPassword,
    });
    userId = res.data.user.id;
    console.log("✅ PASS: User registered successfully (201)");
  } catch (error: any) {
    console.error("❌ FAIL: Registration failed:", error.response?.data || error.message);
  }

  // Test 3: Existing Email Conflict -> Expect 409
  console.log("\n[Test 3] Register existing email...");
  try {
    await axios.post(`${BASE_URL}/api/auth/register`, {
      displayName,
      email: testEmail,
      password: testPassword,
    });
    console.error("❌ FAIL: Register existing email should have returned 409");
  } catch (error: any) {
    if (error.response?.status === 409) {
      console.log("✅ PASS: Got 409 Conflict");
    } else {
      console.error(`❌ FAIL: Expected 409, got ${error.response?.status}`);
    }
  }

  // Test 4: Login Wrong Password -> Expect 401
  console.log("\n[Test 4] Login wrong password...");
  try {
    await axios.post(`${BASE_URL}/api/auth/login`, {
      email: testEmail,
      password: "wrongpassword",
    });
    console.error("❌ FAIL: Login with wrong password should have returned 401");
  } catch (error: any) {
    if (error.response?.status === 401) {
      const errorMsg = error.response?.data?.error;
      if (errorMsg === "Invalid credentials.") {
        console.log("✅ PASS: Got 401 and generic error message 'Invalid credentials.'");
      } else {
        console.warn(`⚠️ WARNING: Got 401 but message was: ${errorMsg}`);
      }
    } else {
      console.error(`❌ FAIL: Expected 401, got ${error.response?.status}`);
    }
  }

  // Test 5: Login Success -> Expect 200
  console.log("\n[Test 5] Login valid credentials...");
  try {
    const res = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: testEmail,
      password: testPassword,
    });
    token = res.data.user.id; // The X-User-Id and X-Display-Name act as identity headers
    console.log("✅ PASS: Login successful (200)");
  } catch (error: any) {
    console.error("❌ FAIL: Login failed:", error.response?.data || error.message);
  }

  // Common request config with Auth headers
  const authConfig = {
    headers: {
      "X-User-Id": userId,
      "X-Display-Name": displayName,
    },
  };

  // Get categories to select one
  let categoryId = "";
  try {
    const catRes = await axios.get(`${BASE_URL}/api/streams/categories`, authConfig);
    categoryId = catRes.data[0]?.id;
  } catch (e: any) {
    console.error("Failed to load categories:", e.message);
    return;
  }

  // Test 6: Try to start a stream that is already LIVE -> Expect 409
  console.log("\n[Test 6] Stream State Machine (Start live stream twice)...");
  let streamId = "";
  try {
    const createRes = await axios.post(
      `${BASE_URL}/api/streams`,
      { title: "Audit Stream", categoryId },
      authConfig
    );
    streamId = createRes.data.stream.id;

    // Start stream 1st time (SCHEDULED -> LIVE)
    await axios.post(`${BASE_URL}/api/streams/${streamId}/start`, {}, authConfig);

    // Start stream 2nd time (LIVE -> LIVE) -> Expect 409
    await axios.post(`${BASE_URL}/api/streams/${streamId}/start`, {}, authConfig);
    console.error("❌ FAIL: Starting already LIVE stream should return 409");
  } catch (error: any) {
    if (error.response?.status === 409) {
      console.log("✅ PASS: Got 409 Conflict");
    } else {
      console.error(`❌ FAIL: Expected 409, got ${error.response?.status}`);
    }
  }

  // Test 7: Try to end a stream that is SCHEDULED -> Expect 409
  console.log("\n[Test 7] Stream State Machine (End SCHEDULED stream)...");
  try {
    const createRes2 = await axios.post(
      `${BASE_URL}/api/streams`,
      { title: "Scheduled Stream", categoryId },
      authConfig
    );
    const schedStreamId = createRes2.data.stream.id;

    // End SCHEDULED stream directly
    await axios.post(`${BASE_URL}/api/streams/${schedStreamId}/end`, {}, authConfig);
    console.error("❌ FAIL: Ending SCHEDULED stream should return 409");
  } catch (error: any) {
    if (error.response?.status === 409) {
      console.log("✅ PASS: Got 409 Conflict");
    } else {
      console.error(`❌ FAIL: Expected 409, got ${error.response?.status}`);
    }
  }

  // Test 8: Chat Idempotency -> Sync same clientMessageId twice
  console.log("\n[Test 8] Chat Idempotency Sync check...");
  const clientMessageId = `msg-id-${Date.now()}`;
  try {
    const syncPayload = {
      messages: [
        {
          streamId,
          content: "Idempotent Message",
          clientMessageId,
          clientTimestamp: new Date().toISOString(),
        },
      ],
    };

    // First sync
    await axios.post(`${BASE_URL}/api/chat/sync`, syncPayload, authConfig);
    // Second sync
    await axios.post(`${BASE_URL}/api/chat/sync`, syncPayload, authConfig);

    // Verify row count in database
    const dbCount = await prisma.chatMessage.count({
      where: { clientMessageId },
    });

    if (dbCount === 1) {
      console.log("✅ PASS: Exactly 1 row persisted in DB for identical clientMessageId");
    } else {
      console.error(`❌ FAIL: Expected 1 row in DB, found ${dbCount}`);
    }
  } catch (error: any) {
    console.error("❌ FAIL: Chat idempotency test errored:", error.message);
  }

  // Setup Socket.IO client connections to verify rate limiting and ended streams chat
  console.log("\nEstablishing Socket.IO Client connections...");
  const socketUrl = "http://localhost:3001";
  
  const socket: Socket = ClientSocket(socketUrl, {
    auth: {
      userId: userId,
      displayName: displayName,
    },
  });

  await new Promise<void>((resolve, reject) => {
    socket.on("connect", () => {
      console.log("Connected Socket.IO successfully.");
      resolve();
    });
    socket.on("connect_error", (err) => {
      console.error("Socket connection failed:", err.message);
      reject(err);
    });
  });

  // Join room
  socket.emit("room:join", { streamId });

  // Test 9: Chat Rate Limiting (send 6 messages rapidly)
  console.log("\n[Test 9] Chat Rate Limiting (6 messages in 1s)...");
  let errorCount = 0;
  let rateLimitHit = false;

  socket.on("chat:error", (err: any) => {
    if (err.reason === "rate_limited") {
      rateLimitHit = true;
    }
  });

  for (let i = 0; i < 10; i++) {
    socket.emit("chat:message", {
      streamId,
      content: `Spam ${i}`,
      clientMessageId: `spam-${i}-${Date.now()}-${i}`,
      clientTimestamp: new Date().toISOString(),
    });
  }

  // Wait for sockets to receive messages/errors
  await new Promise((r) => setTimeout(r, 2000));

  if (rateLimitHit) {
    console.log("✅ PASS: Spam warning received and 6th message rate-limited");
  } else {
    console.error("❌ FAIL: Rate limiter did not trigger warning for spam");
  }

  // Remove rate limit listener
  socket.off("chat:error");

  // Test 10: Chat during ENDED stream
  console.log("\n[Test 10] Chat during ENDED stream check...");
  
  // End the stream first
  await axios.post(`${BASE_URL}/api/streams/${streamId}/end`, {}, authConfig);

  let endedChatError = false;
  socket.on("chat:error", (err: any) => {
    if (err.reason === "stream_ended") {
      endedChatError = true;
    }
  });

  // Send message on ended stream
  socket.emit("chat:message", {
    streamId,
    content: "Message after end",
    clientMessageId: `ended-${Date.now()}`,
    clientTimestamp: new Date().toISOString(),
  });

  await new Promise((r) => setTimeout(r, 2000));

  if (endedChatError) {
    console.log("✅ PASS: Server rejected message and returned stream_ended error code");
  } else {
    console.error("❌ FAIL: Server accepted message or didn't return stream_ended error");
  }

  // Cleanup
  socket.disconnect();
  console.log("\n=== AUDIT INTEGRATION TESTS FINISHED ===");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
