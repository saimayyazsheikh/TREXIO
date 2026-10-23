import { afterAll, beforeAll, describe, it } from "vitest";
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { readFileSync } from "fs";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-traxio",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});

afterAll(async () => {
  await env.cleanup();
});

describe("baseline firestore rules", () => {
  it("deny anonymous reads and writes", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "orgs/o1/users/x")));
    await assertFails(setDoc(doc(db, "orgs/o1/users/x"), { a: 1 }));
  });

  it("deny signed-in users on collections no phase has opened yet", async () => {
    const db = env.authenticatedContext("u1", { role: "admin", orgId: "o1" }).firestore();
    await assertFails(getDoc(doc(db, "orgs/o1/futureThings/x")));
    await assertFails(setDoc(doc(db, "orgs/o1/futureThings/x"), { a: 1 }));
  });
});
