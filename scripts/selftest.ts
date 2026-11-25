import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { GET as getEventRoute } from "@/app/api/events/[eventId]/route";
import { DELETE as deleteExpenseRoute, PATCH as patchExpenseRoute } from "@/app/api/expenses/route";
import { POST as createDecisionRoute } from "@/app/api/decisions/route";
import { POST as nudgeBeeCallbackRoute } from "@/app/api/nudgebee/callback/route";
import { runAgentStep } from "@/lib/agent/orchestrator";
import {
  CreateEventSchema,
  CreateProposalSchema,
  DEFAULT_EVENT_FLAGS,
  FORBIDDEN_AGENT_ACTIONS,
  NudgeBeeCallbackSchema,
  READ_TOOLS,
  WRITE_TOOLS,
  type EventFlags,
  type ProposedAgentAction,
} from "@/lib/contracts";
import { MemoryRepository } from "@/lib/db/memory";
import { setRepositoryForTests } from "@/lib/db/repository";
import { computeImpact, summarizeBudget } from "@/lib/domain/budget";
import { seedDemoEvent } from "@/lib/seed-data";

let passed = 0;
let failed = 0;

async function runTest(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL: ${name}`);
    console.error(err);
  }
}

async function main() {
  const repo = new MemoryRepository();
  setRepositoryForTests(repo);

  const { event, members, expenses } = await seedDemoEvent(repo);
  const meera = members.find((m) => m.role === "organizer")!;
  const lakshmi = members.find((m) => m.role === "decision_owner")!;
  const karthik = members.find((m) => m.role === "helper")!;
  const catering = expenses.find((e) => e.title.includes("Catering"))!;
  const decor = expenses.find((e) => e.title.includes("Floral"))!;
  const photo = expenses.find((e) => e.title.includes("Candid"))!;

  const testFlags: EventFlags = {
    ...DEFAULT_EVENT_FLAGS,
    refreshed_at: new Date().toISOString(),
  };

  // 1. Golden budget test
  await runTest("1. Golden budget impact calculation (150->200 & alternative 170)", () => {
    const impact = computeImpact(event, expenses, {
      expenseId: catering.id,
      previousValue: 150,
      requestedValue: 200,
    });
    assert.equal(impact.status, "ok");
    assert.equal(impact.baselineCommittedINR, 108000);
    assert.equal(impact.deltaINR, 17500);
    assert.equal(impact.projectedCommittedINR, 125500);
    assert.equal(impact.overUnderBudgetINR, 5500);
    assert.ok(impact.alternativeSample, "Expected alternativeSample");
    assert.equal(impact.alternativeSample.quantity, 170);
    assert.equal(impact.alternativeSample.deltaINR, 7000);
    assert.equal(impact.alternativeSample.projectedCommittedINR, 115000);
    assert.equal(impact.alternativeSample.overUnderBudgetINR, -5000);
  });

  // 2. Category summary including price-unknown items (never counted as 0)
  await runTest("2. Category summary tracks price-unknown items without counting as 0", async () => {
    const cats = await repo.listCategories(event.id);
    const miscCat = cats.find((c) => c.name === "Miscellaneous") ?? cats[0];
    const unknownExp = await repo.createExpense({
      event_id: event.id,
      category_id: miscCat.id,
      title: "Shehnai / Nadaswaram duo",
      vendor_id: null,
      quantity: 1,
      unit_price_inr: null,
      committed_inr: 0,
      paid_inr: 0,
      status: "estimate",
      vendor_confirmation: "not_applicable",
      source: "estimate",
      quote_date: null,
      version: 1,
      note: "Awaiting quote",
    });

    const allExpenses = await repo.listExpenses(event.id);
    const summary = summarizeBudget(event, cats, allExpenses, []);
    assert.equal(summary.committedINR, 108000);
    assert.equal(summary.priceUnknownExpenses.length, 1);
    assert.equal(summary.priceUnknownExpenses[0].id, unknownExp.id);
    const catSummary = summary.categories.find((c) => c.categoryId === miscCat.id)!;
    assert.equal(catSummary.priceUnknownCount, 1);
    assert.equal(catSummary.committedINR, 0);

    // Clean up extra expense before remaining tests
    await repo.deleteExpense(event.id, unknownExp.id);
  });

  // 3. Zod rejection cases
  await runTest("3. Zod rejection cases (quantity <= 0, invalid event, invalid NudgeBee callback)", () => {
    const badPropZero = CreateProposalSchema.safeParse({
      expense_id: catering.id,
      requested_value: 0,
      source_text: "Make plates 0",
    });
    assert.equal(badPropZero.success, false);

    const badPropNeg = CreateProposalSchema.safeParse({
      expense_id: catering.id,
      requested_value: -10,
      source_text: "Make plates -10",
    });
    assert.equal(badPropNeg.success, false);

    const badEvent = CreateEventSchema.safeParse({
      name: "X",
      type: "not_an_event_type",
      city: "",
      event_date: "2026/12/01",
      guest_count: 0,
      total_budget_inr: -500,
    });
    assert.equal(badEvent.success, false);

    const badCallback = NudgeBeeCallbackSchema.safeParse({
      kind: "change_request",
      refId: "not-a-uuid",
      decision: "maybe",
      idempotencyKey: "",
    });
    assert.equal(badCallback.success, false);
  });

  // 4. NudgeBee callback auth, idempotency, conflicting decision, and stale check
  await runTest("4. NudgeBee callback auth (401), idempotency (200/409), and stale check", async () => {
    process.env.CALLBACK_SECRET = "tayyari-selftest-secret";

    // Create a proposal on catering (150 -> 200) via API
    const createReq = new NextRequest(
      `http://localhost/api/decisions?eventId=${event.id}&t=${meera.access_token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expense_id: catering.id,
          requested_value: 200,
          source_text: "Increase catering plates to 200",
          source_language: "en-IN",
          decision_owner_id: lakshmi.id,
        }),
      }
    );
    const createRes = await createDecisionRoute(createReq);
    assert.equal(createRes.status, 201);
    const { proposal } = await createRes.json();

    // Mark as pending_approval (simulating dispatch to NudgeBee)
    await repo.updateProposal(event.id, proposal.id, {
      status: "pending_approval",
      workflow_ref: "wf-selftest-1",
    });

    // Missing auth -> 401
    const unauthReq = new NextRequest("http://localhost/api/nudgebee/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "change_request",
        refId: proposal.id,
        decision: "approved",
        idempotencyKey: "idem-unauth",
      }),
    });
    const unauthRes = await nudgeBeeCallbackRoute(unauthReq);
    assert.equal(unauthRes.status, 401);

    // Wrong secret -> 401
    const wrongAuthReq = new NextRequest("http://localhost/api/nudgebee/callback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer wrong-secret",
      },
      body: JSON.stringify({
        kind: "change_request",
        refId: proposal.id,
        decision: "approved",
        idempotencyKey: "idem-wrong",
      }),
    });
    const wrongAuthRes = await nudgeBeeCallbackRoute(wrongAuthReq);
    assert.equal(wrongAuthRes.status, 401);

    // Valid approval -> 200
    const approveReq = new NextRequest("http://localhost/api/nudgebee/callback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer tayyari-selftest-secret",
      },
      body: JSON.stringify({
        kind: "change_request",
        refId: proposal.id,
        decision: "approved",
        idempotencyKey: "idem-approve-1",
      }),
    });
    const approveRes = await nudgeBeeCallbackRoute(approveReq);
    assert.equal(approveRes.status, 200);

    const updatedCatering = await repo.getExpense(event.id, catering.id);
    assert.equal(updatedCatering?.quantity, 200);
    assert.equal(updatedCatering?.committed_inr, 70000);
    assert.equal(updatedCatering?.version, 2);

    // Duplicate callback with same idempotencyKey -> 200 without double-applying
    const dupReq = new NextRequest("http://localhost/api/nudgebee/callback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer tayyari-selftest-secret",
      },
      body: JSON.stringify({
        kind: "change_request",
        refId: proposal.id,
        decision: "approved",
        idempotencyKey: "idem-approve-1",
      }),
    });
    const dupRes = await nudgeBeeCallbackRoute(dupReq);
    assert.equal(dupRes.status, 200);
    const dupBody = await dupRes.json();
    assert.equal(dupBody.idempotent, true);
    const afterDup = await repo.getExpense(event.id, catering.id);
    assert.equal(afterDup?.version, 2);

    // Conflicting decision -> 409
    const conflictReq = new NextRequest("http://localhost/api/nudgebee/callback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer tayyari-selftest-secret",
      },
      body: JSON.stringify({
        kind: "change_request",
        refId: proposal.id,
        decision: "rejected",
        idempotencyKey: "idem-conflict-1",
      }),
    });
    const conflictRes = await nudgeBeeCallbackRoute(conflictReq);
    assert.equal(conflictRes.status, 409);

    // Stale check: draft proposal on decor, then modify decor price/version, then callback
    const staleCreateReq = new NextRequest(
      `http://localhost/api/decisions?eventId=${event.id}&t=${meera.access_token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expense_id: decor.id,
          requested_value: 2,
          source_text: "Double floral decor",
          source_language: "en-IN",
          decision_owner_id: lakshmi.id,
        }),
      }
    );
    const staleCreateRes = await createDecisionRoute(staleCreateReq);
    assert.equal(staleCreateRes.status, 201);
    const { proposal: staleProp } = await staleCreateRes.json();
    await repo.updateProposal(event.id, staleProp.id, {
      status: "pending_approval",
    });

    // Mutate decor unit_price_inr -> increments version to 2
    const patchExpReq = new NextRequest(
      `http://localhost/api/expenses?eventId=${event.id}&t=${meera.access_token}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: decor.id, unit_price_inr: 18000 }),
      }
    );
    const patchExpRes = await patchExpenseRoute(patchExpReq);
    assert.equal(patchExpRes.status, 200);

    const staleCbReq = new NextRequest("http://localhost/api/nudgebee/callback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer tayyari-selftest-secret",
      },
      body: JSON.stringify({
        kind: "change_request",
        refId: staleProp.id,
        decision: "approved",
        idempotencyKey: "idem-stale-1",
      }),
    });
    const staleCbRes = await nudgeBeeCallbackRoute(staleCbReq);
    assert.equal(staleCbRes.status, 200);
    const staleBody = await staleCbRes.json();
    assert.equal(staleBody.status, "stale");
    assert.equal(staleBody.stale, true);

    const decorAfterStale = await repo.getExpense(event.id, decor.id);
    assert.equal(decorAfterStale?.quantity, 1);
    assert.equal(decorAfterStale?.committed_inr, 18000);
  });

  // 5. Amount hiding for Karthik (helper, can_see_amounts=false)
  await runTest("5. Server-side amount redaction for Karthik (can_see_amounts=false)", async () => {
    const req = new NextRequest(
      `http://localhost/api/events/${event.id}?t=${karthik.access_token}`
    );
    const res = await getEventRoute(req, {
      params: Promise.resolve({ eventId: event.id }),
    });
    assert.equal(res.status, 200);
    const payload = await res.json();

    assert.equal(payload.member.can_see_amounts, false);
    assert.equal(payload.event.total_budget_inr, null);
    for (const c of payload.categories) {
      assert.equal(c.allocated_inr, null);
    }
    for (const e of payload.expenses) {
      assert.equal(e.unit_price_inr, null);
      assert.equal(e.committed_inr, null);
      assert.equal(e.paid_inr, null);
    }
    for (const p of payload.proposals) {
      assert.equal(p.baseline_unit_price_inr, null);
      assert.equal(p.impact.baselineCommittedINR, null);
      assert.equal(p.impact.deltaINR, null);
      assert.equal(p.impact.projectedCommittedINR, null);
      assert.equal(p.impact.overUnderBudgetINR, null);
    }
    assert.equal(payload.budgetSummary.amountsHidden, true);
    assert.equal(payload.budgetSummary.totalBudgetINR, null);
    assert.equal(payload.budgetSummary.allocatedINR, null);
    assert.equal(payload.budgetSummary.committedINR, null);
    assert.equal(payload.budgetSummary.paidINR, null);
    assert.equal(payload.budgetSummary.remainingOverallINR, null);
    for (const cs of payload.budgetSummary.categories) {
      assert.equal(cs.allocatedINR, null);
      assert.equal(cs.committedINR, null);
      assert.equal(cs.paidINR, null);
    }
    // Non-organizer must not receive other members' tokens
    for (const m of payload.members) {
      assert.equal(m.access_token, undefined);
    }
  });

  // 6. One-pending-proposal-per-expense rule + expense delete block
  await runTest("6. One-pending-proposal-per-expense rule returns 409 & blocks expense delete", async () => {
    const firstReq = new NextRequest(
      `http://localhost/api/decisions?eventId=${event.id}&t=${meera.access_token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expense_id: photo.id,
          requested_value: 2,
          source_text: "Add second photographer",
          source_language: "en-IN",
        }),
      }
    );
    const firstRes = await createDecisionRoute(firstReq);
    assert.equal(firstRes.status, 201);
    const { proposal: firstProp } = await firstRes.json();

    await repo.updateProposal(event.id, firstProp.id, {
      status: "pending_approval",
    });

    const secondReq = new NextRequest(
      `http://localhost/api/decisions?eventId=${event.id}&t=${meera.access_token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expense_id: photo.id,
          requested_value: 3,
          source_text: "Try second proposal on same expense",
          source_language: "en-IN",
        }),
      }
    );
    const secondRes = await createDecisionRoute(secondReq);
    assert.equal(secondRes.status, 409);

    const delReq = new NextRequest(
      `http://localhost/api/expenses?id=${photo.id}&eventId=${event.id}&t=${meera.access_token}`,
      { method: "DELETE" }
    );
    const delRes = await deleteExpenseRoute(delReq);
    assert.equal(delRes.status, 409);
  });

  // 7. Agent tool permission enforcement
  await runTest("7. Agent rejects unknown tools and forbidden actions (approve_decision / mark_food_safe)", async () => {
    assert.ok(FORBIDDEN_AGENT_ACTIONS.includes("approve_decision"));
    assert.ok(FORBIDDEN_AGENT_ACTIONS.includes("mark_food_safe"));
    assert.ok(!(READ_TOOLS as readonly string[]).includes("approve_decision"));
    assert.ok(!(WRITE_TOOLS as readonly string[]).includes("approve_decision"));
    assert.ok(!(READ_TOOLS as readonly string[]).includes("mark_food_safe"));
    assert.ok(!(WRITE_TOOLS as readonly string[]).includes("mark_food_safe"));

    for (const badTool of ["approve_decision", "mark_food_safe", "unknown_magic_tool"]) {
      const turn = await repo.createAgentTurn({
        event_id: event.id,
        member_id: meera.id,
        role: "assistant",
        content: "Pending test",
        tool_name: badTool,
        tool_args: {},
        tool_result: null,
        pending_action: {
          tool: badTool as ProposedAgentAction["tool"],
          label: `Test ${badTool}`,
          args: { id: randomUUID() },
        },
        action_status: "pending",
      });

      const res = await runAgentStep({
        repo,
        event,
        member: meera,
        flags: testFlags,
        confirmActionTurnId: turn.id,
      });
      assert.equal(res.status, 403, `Expected 403 for ${badTool}`);
    }
  });

  console.log(`\nSelftest summary: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Selftest crashed:", err);
  process.exit(1);
});
