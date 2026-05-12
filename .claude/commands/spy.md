# /spy — Competitor Ad Intelligence Scraper

## Description
Query the Meta Ad Library API for all active ads from a list of competitor pages. Diff against the previous week's pull (stored in ./reports/spy-last.json) to surface only new creative. Output a structured markdown intelligence report.

## Parameters
- --competitors (required): Comma-separated Facebook page IDs or @handles
- --country (default: AR): Country code for ad library query (AR=Argentina, MX=Mexico, CO=Colombia, etc.)
- --output (default: report): Output format — "report" (markdown) or "json"
- --save-baseline: Flag to save current pull as the new baseline for next week's diff

## Prerequisites
- Meta Ad Library API access (public endpoint)
- Access token in $META_ACCESS_TOKEN for authenticated requests
- Previous baseline stored at ./reports/spy-last.json (empty on first run)

## Execution Steps

1. **Resolve page IDs** — for each @handle, call: `GET https://graph.facebook.com/v21.0/{handle}?fields=id&access_token=$META_ACCESS_TOKEN`

2. **Query Ad Library** for each page: `GET https://graph.facebook.com/v21.0/ads_archive?access_token=$META_ACCESS_TOKEN&fields=id,ad_creative_body,ad_creative_link_caption,ad_creative_link_description,ad_creative_link_title,ad_delivery_start_time,ad_delivery_stop_time,page_name,spend,impressions,currency,ad_snapshot_url&search_page_ids={page_id}&ad_reached_countries=["{country}"]&ad_active_status=ACTIVE&limit=100` — paginate through all results using the "next" cursor. If HTTP 429, wait 60 seconds and retry.

3. **Diff against baseline** — load ./reports/spy-last.json, identify new ad IDs not in baseline, note stopped ads.

4. **Classify each new ad**:
   - Hook (opening line or headline)
   - CTA text
   - Offer type (Discount / Free shipping / Free trial / Social proof / Problem-solution / Product demo / Testimonial / Urgency / Other)
   - Creative angle (Problem-aware / Solution-aware / Product-aware / Brand awareness / Retargeting)
   - Run length (New 0-7d / Testing 8-30d / Winner 30d+)

5. **Identify trends** — count offer types across competitors, flag any used by 2+ competitors as "Market Trend".

6. **Output** ./reports/spy-{YYYY-MM-DD}.md with:
   - Summary section
   - New Ads table (Page | Hook | CTA | Offer Type | Angle | Running)
   - Stopped Ads list
   - Recommended Creative Angles to Test

7. If --save-baseline: overwrite ./reports/spy-last.json with current full pull.

## Output Format
Markdown report at ./reports/spy-{YYYY-MM-DD}.md. If --output=json, also write ./reports/spy-{YYYY-MM-DD}.json.

## Error Handling
- Page ID returns 0 ads: log and continue
- API error 100 (invalid page ID): skip and note in report
- HTTP 429 rate limit: wait 60 seconds, retry up to 3 times
- No baseline exists: note "First run — no diff available"

## Example Invocation
```
/spy --competitors="@inmobiliariazonanorte,@properties.capital" --country=AR --save-baseline
```
