# Relationship Intelligence — Ruth Findlay Prototype Profile

Created: 2026-06-29  
Mode: illustrative read-only prototype; no live migration performed.

## Prototype purpose

Show how one real lead should become a source-backed relationship graph rather than one flat lead row.

## Source evidence inspected

- Supabase lead row `2c2ae544-aee8-4451-9cae-34cdfc7b8b37` read by SELECT only.
- Gmail tiny search for Ruth terms returned zero matching messages.
- Public web search/extract found:
  - LinkedIn: `https://linkedin.com/in/ruth-findlay-6542a683`
  - Autex Acoustics project page: `https://www.autexacoustics.co.nz/resources/projects/te-huruhi-school-hall-refurbishment`
  - Abodo project page: `https://www.abodo.com.au/projects/in-with-the-new-te-huruhi-school-new-zealand`
- Live Innate pages extracted:
  - `https://innatefurniture.co.nz/pages/boardroom-tables`
  - `https://innatefurniture.co.nz/pages/timber-panels`
  - `https://innatefurniture.co.nz/pages/commercial-1`

## Canonical party

```yaml
party:
  proposed_party_type: person
  display_name: Ruth Findlay
  primary_location: Auckland
  primary_role_summary: Auckland spatial/interior designer and specifier
  relationship_status: new / active lead relationship
  relationship_value: potentially strategic
  confidence: high for role/location from Supabase + public web; medium for future referral value
  privacy_level: normal for public professional facts; restricted for direct phone/contact method
```

## Roles

- Lead contact — source: Supabase lead row, confidence high.
- Spatial/interior designer — source: Supabase lead row + public LinkedIn/web, confidence high.
- Specifier / client intermediary — source: phone-call lead notes, confidence high.
- Potential referral source — source: business inference from designer/specifier role, confidence medium; should be labelled as inference, not fact.

## Contact methods

```yaml
contact_methods:
  - type: phone
    value: stored in Supabase lead row
    source: supabase:leads:2c2ae544-aee8-4451-9cae-34cdfc7b8b37
    privacy_level: restricted
    confidence: high
  - type: email
    value: unknown
    source: none found in read-only checks
    confidence: unknown
```

## Opportunity

```yaml
opportunity:
  title: Auckland boardroom table for Ruth Findlay client
  opportunity_type: boardroom_table
  primary_contact_party: Ruth Findlay
  client_party: unknown / not yet captured
  estimated_value: 7000
  value_source: Supabase lead estimated_value and phone-call notes; ballpark discussed $6k-$8k
  stage: qualifying
  priority: hot
  source_system: manual_phone_call
  source_ref: leads:2c2ae544-aee8-4451-9cae-34cdfc7b8b37
  next_follow_up_at: 2026-07-02
  next_action: Watch for client contact; if none arrives by follow-up date, light check-in with Ruth.
```

## Product intent / design context

Source: Supabase lead notes + live Innate boardroom/benchtop page extracts.

- Boardroom table around 3–3.5m.
- Possible double Crossroads base.
- Pebble-shaped top was discussed as one starting direction.
- Colour/finish flexibility matters.
- Possible integrated power unit.
- Straightforward Auckland delivery allowed for in ballpark.
- Ruth/client should be guided through boardroom table shapes, colours, timber/finish samples and power/data options.
- Benchtops/configurator page was mentioned for shelving units and related options.

## Public research profile

Facts to store as source-backed claims:

| Claim | Source | Confidence | Usefulness |
|---|---|---:|---|
| Ruth Findlay is an Auckland-based spatial/interior designer. | Supabase lead + LinkedIn extract | High | Helps treat her as a specifier/intermediary, not only one buyer. |
| LinkedIn describes her as Spatial Designer + Interiors / consultant. | LinkedIn extract | High | Sales context. |
| Public project pages credit Ruth Findlay and Kirsten Newton / SPACEINBTWN on Te Huruhi School/Waiheke work. | Autex + Abodo extracts | High | Shows material-led spatial/project capability. |
| Te Huruhi project involved acoustic, cultural, sculptural and material detailing. | Autex + Abodo extracts | High | Suggests sales angle: bespoke forms, timber/material story, supplier coordination. |
| Ruth may be a useful repeat/referral relationship for commercial/interior projects. | Inference from professional role + current lead | Medium | Keep as business inference; do not display as fact. |

## Proposed graph edges

```text
Ruth Findlay (party:person)
  has_role -> lead_contact
  has_role -> spatial_designer
  has_role -> specifier
  has_contact_method -> phone (restricted)
  connected_to -> Opportunity: Auckland boardroom table for client
  mentioned_in -> Touchpoint: 2026-06-29 phone call
  associated_public_profile -> LinkedIn URL
  associated_public_project -> Te Huruhi School / Autex URL
  associated_public_project -> Te Huruhi School / Abodo URL

Opportunity: Auckland boardroom table for Ruth's client
  interested_in -> Boardroom tables page
  interested_in -> Timber panels / configurator page
  has_product_intent -> boardroom table, 3-3.5m, pebble/double Crossroads, power/data, delivery
  needs_info -> client identity, exact dimensions, power/data spec, budget approval, timeline
```

## Unknowns / do not guess

- Ruth's client identity.
- Client email/phone.
- Exact table dimensions, seating count and room plan.
- Power/data module type and AV/cable requirements.
- Final timber, finish, base and top shape.
- Budget approval pathway.
- Timeline and decision date.
- Whether Ruth wants samples or a designer/specifier proof pack.

## Safest next action if approved later

No customer message was drafted/sent in this worker. If Guido approves a sales follow-up later, draft a light Ruth check-in only after checking whether her client has contacted Innate since the phone call.
