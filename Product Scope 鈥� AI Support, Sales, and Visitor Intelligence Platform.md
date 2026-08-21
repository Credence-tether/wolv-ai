# Product Scope — AI Support, Sales, and Visitor Intelligence Platform

## Product Definition

This project is a single integrated platform for AI customer support, sales assistance, approved-knowledge answers, persistent conversations, visitor intelligence, agent handoff, and administrative oversight. It is not a generic FAQ chatbot. Its primary operating principle is that the assistant uses only approved business knowledge, retains relevant context, makes multiple meaningful attempts to resolve legitimate requests, supports informed and non-deceptive customer decision-making, and routes cases to people when it cannot safely or reliably proceed.

## Approved Capability Boundary

| Product area | Included behaviour |
| --- | --- |
| Customer support and sales assistance | The assistant will answer approved business questions, troubleshoot, explain plans and processes, recognize objections and interest signals, and guide genuinely interested visitors toward accurate next steps without false urgency, fabricated claims, or manipulation. |
| Knowledge grounding | Administrators can add or refresh approved website and business content. Answers concerning the business are grounded in that material. When verified information is unavailable, the assistant will state that limitation instead of guessing. |
| Conversation persistence | Anonymous and authenticated visitors receive durable conversation history. Every customer, AI, and agent message, status transition, substantive resolution attempt, escalation, assignment, and resolution outcome is retained. |
| High-persistence resolution | The AI follows the required progression of understand, resolve, reframe, fallback, and only then human handoff. The default unresolved-attempt limit is **three substantive attempts**, and administrators can change it. |
| Intent and safety | The platform classifies conversational intent, frustration, potential purchase interest, complexity, sensitivity, and manipulation attempts. It refuses attempts to override instructions, obtain private data, or force unsupported claims, while treating ordinary disagreement as a legitimate request for explanation. |
| Visitor intelligence | The platform creates secure sessions at arrival, observes consent-appropriate page and interaction events, maintains an activity timeline, calculates online or offline presence through visitor heartbeats, and exposes approximate location only when legitimately available. It never seeks precise location without an explicit browser permission flow. |
| Live operations | One coherent real-time event layer will drive chat, conversation-state changes, escalation, agent pickup, agent replies, visitor presence, activity updates, intent signals, and in-app notifications. |
| Human support | Authorized agents can inspect escalations, read the full transcript and handoff summary, review relevant activity context, claim a case, reply, and resolve it. |
| Administration | Authorized administrators can manage agent access, search and review conversations, inspect visitor sessions and journeys, configure escalation and sensitive-topic rules, maintain approved knowledge, and monitor active visitors. |

## Conversation and Escalation Contract

Each conversation occupies one auditable state at a time: `AI-handling`, `pending-agent`, `agent-active`, or `resolved`. A handoff preserves all original messages and creates an agent-ready briefing covering the visitor’s objective, key facts, questions, attempted resolutions, objections, relevant activity context, and escalation reason.

| Escalation trigger | Required outcome |
| --- | --- |
| The visitor asks for a human | Immediate transition to `pending-agent`. |
| The AI detects a sensitive issue | Immediate transition to `pending-agent`. |
| The AI cannot access the authority or verified knowledge required to answer safely | Immediate transition to `pending-agent`. |
| The issue is genuinely too complex for safe resolution | Immediate transition to `pending-agent`. |
| The visitor remains unresolved after three substantive attempts, or the current admin-configured limit | Transition to `pending-agent` after the final permitted meaningful strategy. |

## Visitor Identity, Privacy, and Access Boundaries

Anonymous visitors will use a secure, non-guessable browser-session identity. Authenticated users will have conversations associated with their account. When a visitor authenticates, only the permitted session history will be associated with that account. No customer-facing endpoint will reveal another visitor’s activity, conversation, or identity.

Visitor monitoring will collect only information necessary for the specified support, presence, and activity features. The system will distinguish approximate, IP-derived geographic data from voluntarily supplied location and any permission-based precise location. It will not collect precise GPS data by default, bypass browser permissions, or expose internal monitoring signals to visitors. Administrators can set retention choices for visitor activity data.

## Live Delivery Decision

The requested event-driven updates require a continuously available server process so that the product can maintain live event subscriptions for customer chat, agent chat, presence, dashboards, notifications, and activity. The application can fall back to frequent database-backed updates if necessary, but that would not deliver the preferred event-driven experience defined in the specification.

| Delivery option | User experience | Operational tradeoff |
| --- | --- | --- |
| **Event-driven live updates — preferred** | Customer messages, agent replies, presence changes, queue activity, and notifications appear immediately. | Requires a continuously running managed instance. |
| Frequent background refresh — fallback** | Updates appear shortly after the next refresh, without manual page reload. | Keeps the default request-scoped hosting model but is less immediate and does not meet the stated preference. |

## Explicit Non-Goals

This delivery will not add external CRM integrations, social-media inboxes, voice, email, SMS, external Slack notifications, file attachments, workforce scheduling, SLA analytics, autonomous financial or business actions, or unrelated marketing automation.

## Acceptance Standard

The product will be considered ready for review only when the approved knowledge boundary, conversation memory, three-attempt persistence rule, visitor sessions and activity context, live presence and notifications, prompt-injection resistance, privacy boundaries, agent handoff, and administrator controls operate as one coherent system across the customer, agent, and administration experiences.
