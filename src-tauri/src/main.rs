#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::io::Write;

#[derive(Serialize, Deserialize, Debug, Clone)]
struct MetricsResponse {
    views: u64,
    likes: u64,
    comments: u64,
    shares: u64,
    engagement_rate: f64,
    #[serde(rename = "postId", skip_serializing_if = "Option::is_none", default)]
    post_id: Option<String>,
}

fn detect_platform(url: &str) -> &'static str {
    if url.contains("instagram.com") { "instagram" }
    else if url.contains("facebook.com") || url.contains("fb.watch") { "facebook" }
    else if url.contains("tiktok.com") { "tiktok" }
    else if url.contains("youtube.com") || url.contains("youtu.be") { "youtube" }
    else { "unknown" }
}

async fn run_apify_actor(client: &reqwest::Client, api_key: &str, actor_id: &str, input: serde_json::Value) -> Result<Vec<serde_json::Value>, String> {
    let url = format!("https://api.apify.com/v2/acts/{}/run-sync-get-dataset-items?token={}", actor_id, api_key);
    let response = client.post(&url).header("Content-Type", "application/json").json(&input).send().await.map_err(|e| format!("Apify request failed: {}", e))?;
    let status = response.status();
    let body = response.text().await.map_err(|e| format!("Failed to read Apify response: {}", e))?;
    if !status.is_success() { return Err(format!("Apify API error ({}): {}", status, &body[..body.len().min(500)])); }
    let items: Vec<serde_json::Value> = serde_json::from_str(&body).map_err(|e| format!("Failed to parse Apify response: {} — body: {}", e, &body[..body.len().min(300)]))?;
    Ok(items)
}

async fn fetch_instagram_metrics(client: &reqwest::Client, api_key: &str, url: &str) -> Result<MetricsResponse, String> {
    let input = serde_json::json!({ "username": [url], "resultsLimit": 1 });
    let items = run_apify_actor(client, api_key, "apify~instagram-post-scraper", input).await?;
    if items.is_empty() { return Err("No data returned from Instagram scraper. The post may be private or the URL invalid.".to_string()); }
    let post = &items[0];
    let likes = post["likesCount"].as_u64().unwrap_or(0);
    let comments = post["commentsCount"].as_u64().unwrap_or(0);
    let views = post["videoPlayCount"].as_u64().or_else(|| post["videoViewCount"].as_u64()).unwrap_or(0);
    let shares = 0u64;
    let base = if views > 0 { views } else { likes * 10 };
    let engagement_rate = if base > 0 { ((likes + comments) as f64 / base as f64) * 100.0 } else { 0.0 };
    Ok(MetricsResponse { views, likes, comments, shares, engagement_rate: (engagement_rate * 100.0).round() / 100.0, post_id: None })
}

fn get_u64_path(value: &serde_json::Value, path: &[&str]) -> Option<u64> {
    let mut current = value;
    for key in path { current = current.get(*key)?; }
    current.as_u64().or_else(|| current.as_i64().and_then(|v| if v >= 0 { Some(v as u64) } else { None })).or_else(|| current.as_f64().and_then(|v| if v >= 0.0 { Some(v as u64) } else { None }))
}

fn get_count_or_len(value: &serde_json::Value, path: &[&str]) -> Option<u64> {
    let mut current = value;
    for key in path { current = current.get(*key)?; }
    if let Some(n) = current.as_u64() { return Some(n) }
    if let Some(n) = current.as_i64() { return if n >= 0 { Some(n as u64) } else { None } }
    if let Some(n) = current.as_f64() { return if n >= 0.0 { Some(n as u64) } else { None } }
    if let Some(arr) = current.as_array() { return Some(arr.len() as u64) }
    None
}

fn sum_object_u64(value: Option<&serde_json::Value>) -> u64 {
    value.and_then(|v| v.as_object()).map(|obj| obj.values().filter_map(|v| v.as_u64().or_else(|| v.as_i64().and_then(|n| if n >= 0 { Some(n as u64) } else { None }))).sum()).unwrap_or(0)
}

fn sum_flat_reaction_fields(post: &serde_json::Value) -> u64 {
    const FIELDS: &[&str] = &["reactionLikeCount", "reactionLoveCount", "reactionHahaCount", "reactionWowCount", "reactionSadCount", "reactionAngryCount", "reactionCareCount"];
    FIELDS.iter().filter_map(|f| post.get(*f).and_then(|v| v.as_u64())).sum()
}

fn write_debug_log(tag: &str, value: &serde_json::Value) {
    let mut path = std::env::temp_dir();
    path.push("content-hub-fb-debug.json");
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        let header = format!("\n========== {} @ {} ==========\n", tag, std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0));
        let _ = f.write_all(header.as_bytes());
        if let Ok(pretty) = serde_json::to_string_pretty(value) { let _ = f.write_all(pretty.as_bytes()); let _ = f.write_all(b"\n"); }
    }
    eprintln!("[content-hub fb-debug] {}: {}", tag, serde_json::to_string(value).unwrap_or_else(|_| "<unserializable>".into()));
}

fn item_looks_like_real_post(item: &serde_json::Value, requested_url: &str) -> bool {
    let nonzero = |path: &[&str]| get_u64_path(item, path).map(|n| n > 0).unwrap_or(false);
    let has_nonzero_likes = nonzero(&["likes"]) || nonzero(&["likesCount"]) || nonzero(&["reactionLikeCount"]);
    let has_nonzero_views = nonzero(&["viewsCount"]) || nonzero(&["playCount"]) || nonzero(&["playCountRounded"]) || nonzero(&["videoViewCount"]);
    let has_nonzero_comments = nonzero(&["comments"]) || nonzero(&["commentsCount"]);
    let has_nonzero_shares = nonzero(&["shares"]) || nonzero(&["sharesCount"]);
    let has_text = item.get("text").and_then(|v| v.as_str()).map(|s| !s.trim().is_empty()).unwrap_or(false);
    let has_feedback_id = item.get("feedbackId").and_then(|v| v.as_str()).map(|s| !s.trim().is_empty()).unwrap_or(false);
    let has_post_id = item.get("postId").and_then(|v| v.as_str()).map(|s| !s.trim().is_empty()).unwrap_or(false) || item.get("post_id").and_then(|v| v.as_str()).map(|s| !s.trim().is_empty()).unwrap_or(false);
    let url_field = item.get("url").and_then(|v| v.as_str()).unwrap_or("");
    let top_level_url = item.get("topLevelUrl").and_then(|v| v.as_str()).unwrap_or("");
    let shareable = item.get("shareable_url").and_then(|v| v.as_str()).unwrap_or("");
    let top_level_reel = item.get("topLevelReelUrl").and_then(|v| v.as_str()).unwrap_or("");
    let url_matches_request = url_matches(requested_url, url_field) || url_matches(requested_url, top_level_url) || url_matches(requested_url, shareable) || url_matches(requested_url, top_level_reel);
    has_nonzero_likes || has_nonzero_views || has_nonzero_comments || has_nonzero_shares || has_text || has_feedback_id || has_post_id || url_matches_request
}

fn extract_reel_id(url: &str) -> Option<String> {
    let lower = url.to_lowercase();
    for needle in ["/reel/", "/posts/", "/videos/"] {
        if let Some(idx) = lower.find(needle) {
            let rest = &url[idx + needle.len()..];
            let end = rest.find(|c: char| c == '/' || c == '?' || c == '#').unwrap_or(rest.len());
            let id: String = rest[..end].chars().filter(|c| c.is_ascii_digit()).collect();
            if !id.is_empty() { return Some(id) }
        }
    }
    None
}

fn parse_post_metrics(post: &serde_json::Value) -> MetricsResponse {
    let views = [["viewsCount"].as_slice(), ["videoViewCount"].as_slice(), ["videoPlayCount"].as_slice(), ["playCount"].as_slice(), ["playCountRounded"].as_slice(), ["views"].as_slice(), ["plays"].as_slice(), ["video_play_count"].as_slice(), ["video_view_count"].as_slice(), ["video", "views"].as_slice(), ["video", "playCount"].as_slice(), ["statistics", "views"].as_slice(), ["feedback", "video_view_count"].as_slice()].iter().find_map(|path| get_u64_path(post, path)).unwrap_or(0);
    let flat_reaction_total = sum_flat_reaction_fields(post);
    let object_reaction_total = sum_object_u64(post.get("reactions")).max(sum_object_u64(post.get("reactionCount")));
    let reaction_fallback = flat_reaction_total.max(object_reaction_total);
    let likes = [["likes"].as_slice(), ["likesCount"].as_slice(), ["likes_count"].as_slice(), ["reactionsCount"].as_slice(), ["reaction_count"].as_slice(), ["totalReactions"].as_slice(), ["statistics", "likes"].as_slice(), ["feedback", "reaction_count", "count"].as_slice(), ["feedback", "reaction_count"].as_slice()].iter().find_map(|path| get_u64_path(post, path)).unwrap_or(0).max(reaction_fallback);
    let comments = [["comments"].as_slice(), ["commentsCount"].as_slice(), ["comments_count"].as_slice(), ["commentCount"].as_slice(), ["totalComments"].as_slice(), ["feedback", "comment_count", "total_count"].as_slice(), ["feedback", "comment_count"].as_slice(), ["statistics", "comments"].as_slice()].iter().find_map(|path| get_count_or_len(post, path)).unwrap_or(0);
    let shares = [["shares"].as_slice(), ["sharesCount"].as_slice(), ["shares_count"].as_slice(), ["shareCount"].as_slice(), ["totalShares"].as_slice(), ["feedback", "share_count", "count"].as_slice(), ["feedback", "share_count"].as_slice(), ["statistics", "shares"].as_slice()].iter().find_map(|path| get_count_or_len(post, path)).unwrap_or(0);
    let base = if views > 0 { views } else { likes.max(1) };
    let engagement_rate = ((likes + comments + shares) as f64 / base as f64) * 100.0;
    let post_id = post.get("postId").and_then(|v| v.as_str()).or_else(|| post.get("post_id").and_then(|v| v.as_str())).or_else(|| post.get("feedbackId").and_then(|v| v.as_str())).map(String::from).or_else(|| ["url", "topLevelUrl", "shareable_url", "topLevelReelUrl"].iter().filter_map(|k| post.get(*k).and_then(|v| v.as_str())).find_map(extract_reel_id));
    MetricsResponse { views, likes, comments, shares, engagement_rate: (engagement_rate * 100.0).round() / 100.0, post_id }
}

async fn try_actor(client: &reqwest::Client, api_key: &str, actor_id: &str, input: serde_json::Value, requested_url: &str) -> Result<MetricsResponse, String> {
    write_debug_log(&format!("INPUT actor={}", actor_id), &input);
    let items = run_apify_actor(client, api_key, actor_id, input).await?;
    write_debug_log(&format!("OUTPUT actor={} itemCount={}", actor_id, items.len()), &serde_json::Value::Array(items.clone()));
    if items.is_empty() { return Err(format!("Actor '{}' returned 0 items for {}", actor_id, requested_url)); }
    let matched = items.iter().find(|item| { let u1 = item.get("url").and_then(|v| v.as_str()).unwrap_or(""); let u2 = item.get("topLevelUrl").and_then(|v| v.as_str()).unwrap_or(""); let u3 = item.get("shareable_url").and_then(|v| v.as_str()).unwrap_or(""); let u4 = item.get("topLevelReelUrl").and_then(|v| v.as_str()).unwrap_or(""); url_matches(requested_url, u1) || url_matches(requested_url, u2) || url_matches(requested_url, u3) || url_matches(requested_url, u4) });
    let chosen = matched.or_else(|| items.iter().find(|i| item_looks_like_real_post(i, requested_url))).unwrap_or(&items[0]);
    let metrics = parse_post_metrics(chosen);
    let all_zero = metrics.views == 0 && metrics.likes == 0 && metrics.comments == 0 && metrics.shares == 0;
    if all_zero && !item_looks_like_real_post(chosen, requested_url) { return Err(format!("Actor '{}' returned {} item(s) but none contain engagement data. Item looks like a page-lookup stub, not a post. See {} for the raw response.", actor_id, items.len(), std::env::temp_dir().join("content-hub-fb-debug.json").display())); }
    write_debug_log(&format!("PARSED actor={}", actor_id), &serde_json::to_value(&metrics).unwrap_or(serde_json::Value::Null));
    Ok(metrics)
}

async fn fetch_facebook_metrics(client: &reqwest::Client, api_key: &str, url: &str) -> Result<MetricsResponse, String> {
    let mut attempts: Vec<String> = Vec::new();
    let input1 = serde_json::json!({ "startUrls": [{ "url": url }], "resultsLimit": 5, "onlyPostsNewerThan": "1970-01-01", "includeNestedComments": false });
    match try_actor(client, api_key, "apify~facebook-posts-scraper", input1, url).await { Ok(m) => return Ok(m), Err(e) => attempts.push(format!("[1] apify/facebook-posts-scraper (raw URL): {}", e)) }
    let normalized = url.replace("://m.facebook.com/", "://www.facebook.com/").replace("://web.facebook.com/", "://www.facebook.com/");
    if normalized != url {
        let input2 = serde_json::json!({ "startUrls": [{ "url": normalized }], "resultsLimit": 5, "onlyPostsNewerThan": "1970-01-01", "includeNestedComments": false });
        match try_actor(client, api_key, "apify~facebook-posts-scraper", input2, &normalized).await { Ok(m) => return Ok(m), Err(e) => attempts.push(format!("[2] apify/facebook-posts-scraper (normalized URL): {}", e)) }
    }
    let input3 = serde_json::json!({ "startUrls": [{ "url": url }], "directUrls": [url], "resultsLimit": 5, "onlyPostsNewerThan": "1970-01-01" });
    match try_actor(client, api_key, "apify~facebook-posts-scraper", input3, url).await { Ok(m) => return Ok(m), Err(e) => attempts.push(format!("[3] apify/facebook-posts-scraper (directUrls): {}", e)) }
    Err(format!("Facebook metrics fetch failed for {}. Tried {} strategy(ies):\n{}\n\nRaw Apify responses have been logged to:\n  {}\n\nMost common causes:\n • The reel/post is private, deleted, region-restricted, or age-gated.\n • The Apify actor 'apify/facebook-posts-scraper' only accepts page/profile URLs — direct reel URLs are supported only on newer actor versions. Open the Apify console and test your URL directly against the actor to confirm.\n • Your Apify account may not have residential proxies enabled, which Facebook often requires for reel scraping. Upgrade plan or enable Apify Proxy.\n • Try pasting the PAGE URL (e.g. https://facebook.com/pagename) into the Facebook live URL field instead of the direct reel URL — the scraper will return the recent reels including yours.", url, attempts.len(), attempts.iter().map(|a| format!("  • {}", a)).collect::<Vec<_>>().join("\n"), std::env::temp_dir().join("content-hub-fb-debug.json").display()))
}

enum ScrapeMatchError { NoItems(String), NotFound { sample_urls: Vec<String>, item_count: usize } }

async fn fetch_facebook_metrics_via_page(client: &reqwest::Client, api_key: &str, page_url: &str, target_post_url: &str, known_post_id: Option<&str>) -> Result<MetricsResponse, String> {
    match try_page_scrape_and_match(client, api_key, page_url, target_post_url, known_post_id, 25).await {
        Ok(metrics) => Ok(metrics),
        Err(ScrapeMatchError::NoItems(msg)) => Err(msg),
        Err(ScrapeMatchError::NotFound { .. }) => {
            write_debug_log("VIA-PAGE RETRY reason=not_found resultsLimit=50", &serde_json::json!({ "page": page_url, "target": target_post_url }));
            match try_page_scrape_and_match(client, api_key, page_url, target_post_url, known_post_id, 50).await {
                Ok(metrics) => Ok(metrics),
                Err(ScrapeMatchError::NoItems(msg)) => Err(msg),
                Err(ScrapeMatchError::NotFound { sample_urls, item_count }) => Err(format!("Scraped '{}' successfully ({} items at resultsLimit=50) but couldn't find a post matching '{}'.\n\nFirst URLs returned by the scraper:\n{}\n\nThis usually means:\n • The reel is older than the 50 most recent posts on the page — the page posts too frequently for this method to see it.\n • The Facebook page URL saved on this workspace doesn't own the reel. Check Workspace Settings.\n • The reel has been deleted.\n\nRaw scrape logged to {}.", page_url, item_count, target_post_url, if sample_urls.is_empty() { "  (none)".to_string() } else { sample_urls.iter().map(|u| format!("  • {}", u)).collect::<Vec<_>>().join("\n") }, std::env::temp_dir().join("content-hub-fb-debug.json").display())),
            }
        }
    }
}

async fn try_page_scrape_and_match(client: &reqwest::Client, api_key: &str, page_url: &str, target_post_url: &str, known_post_id: Option<&str>, results_limit: u32) -> Result<MetricsResponse, ScrapeMatchError> {
    let input = serde_json::json!({ "startUrls": [{ "url": page_url }], "resultsLimit": results_limit, "onlyPostsNewerThan": "1970-01-01", "includeNestedComments": false });
    write_debug_log(&format!("VIA-PAGE INPUT actor=apify~facebook-posts-scraper page={} target={} resultsLimit={} knownId={:?}", page_url, target_post_url, results_limit, known_post_id), &input);
    let items = run_apify_actor(client, api_key, "apify~facebook-posts-scraper", input).await.map_err(|e| ScrapeMatchError::NoItems(format!("Apify page scrape failed: {}", e)))?;
    write_debug_log(&format!("VIA-PAGE OUTPUT actor=apify~facebook-posts-scraper itemCount={} resultsLimit={}", items.len(), results_limit), &serde_json::Value::Array(items.clone()));
    if items.is_empty() { return Err(ScrapeMatchError::NoItems(format!("Page scrape of '{}' returned 0 items. The page may not exist, be private, or require residential proxies. See {} for the raw response.", page_url, std::env::temp_dir().join("content-hub-fb-debug.json").display()))) }
    let target_id_from_url = extract_reel_id(target_post_url);
    let matched = items.iter().find(|item| {
        if let Some(known) = known_post_id { if item_post_id_equals(item, known) { return true; } }
        let u1 = item.get("url").and_then(|v| v.as_str()).unwrap_or("");
        let u2 = item.get("topLevelUrl").and_then(|v| v.as_str()).unwrap_or("");
        let u3 = item.get("shareable_url").and_then(|v| v.as_str()).unwrap_or("");
        let u4 = item.get("topLevelReelUrl").and_then(|v| v.as_str()).unwrap_or("");
        if url_matches(target_post_url, u1) || url_matches(target_post_url, u2) || url_matches(target_post_url, u3) || url_matches(target_post_url, u4) { return true; }
        if let Some(target) = target_id_from_url.as_deref() {
            if item_post_id_equals(item, target) { return true; }
            for u in [u1, u2, u3, u4].iter() { if let Some(id) = extract_reel_id(*u) { if id == target { return true; } } }
        }
        false
    });
    match matched {
        Some(item) => { let metrics = parse_post_metrics(item); write_debug_log(&format!("VIA-PAGE PARSED resultsLimit={} matchedPostId={:?}", results_limit, metrics.post_id), &serde_json::to_value(&metrics).unwrap_or(serde_json::Value::Null)); Ok(metrics) },
        None => { let sample_urls: Vec<String> = items.iter().take(10).filter_map(|item| item.get("url").and_then(|v| v.as_str()).or_else(|| item.get("topLevelUrl").and_then(|v| v.as_str())).map(String::from)).collect(); Err(ScrapeMatchError::NotFound { sample_urls, item_count: items.len() }) }
    }
}

fn item_post_id_equals(item: &serde_json::Value, candidate: &str) -> bool { for key in ["postId", "post_id", "feedbackId"] { if let Some(id) = item.get(key).and_then(|v| v.as_str()) { if id == candidate { return true; } } } false }
fn url_matches(a: &str, b: &str) -> bool { fn normalize(u: &str) -> String { let u = u.trim().to_lowercase(); let u = u.trim_start_matches("https://").trim_start_matches("http://").to_string(); let u = u.trim_start_matches("www.").trim_start_matches("m.").trim_start_matches("web.").to_string(); u.trim_end_matches('/').to_string() } let na = normalize(a); let nb = normalize(b); if na.is_empty() || nb.is_empty() { return false } na == nb || na.contains(&nb) || nb.contains(&na) }

async fn fetch_tiktok_metrics(client: &reqwest::Client, api_key: &str, url: &str) -> Result<MetricsResponse, String> {
    let input = serde_json::json!({ "postURLs": [url], "resultsPerPage": 1 });
    let items = run_apify_actor(client, api_key, "clockworks~free-tiktok-scraper", input).await?;
    if items.is_empty() { return Err("No data returned from TikTok scraper. The post may be private or the URL invalid.".to_string()) }
    let post = &items[0];
    let views = post["playCount"].as_u64().or_else(|| post["plays"].as_u64()).or_else(|| post["videoMeta"].as_object().and_then(|m| m["playCount"].as_u64())).unwrap_or(0);
    let likes = post["diggCount"].as_u64().or_else(|| post["likes"].as_u64()).unwrap_or(0);
    let comments = post["commentCount"].as_u64().or_else(|| post["comments"].as_u64()).unwrap_or(0);
    let shares = post["shareCount"].as_u64().or_else(|| post["shares"].as_u64()).unwrap_or(0);
    let engagement_rate = if views > 0 { ((likes + comments + shares) as f64 / views as f64) * 100.0 } else { 0.0 };
    Ok(MetricsResponse { views, likes, comments, shares, engagement_rate: (engagement_rate * 100.0).round() / 100.0, post_id: None })
}

#[tauri::command]
async fn debug_fetch_facebook_post(url: String, api_key: String) -> Result<String, String> {
    if api_key.is_empty() { return Err("API key is empty. Please add your Apify API token in Settings.".to_string()) }
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(120)).build().map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    let parsed = fetch_facebook_metrics(&client, &api_key, &url).await;
    let raw_probe_input = serde_json::json!({ "startUrls": [{ "url": url }], "resultsLimit": 5, "onlyPostsNewerThan": "1970-01-01", "includeNestedComments": false });
    let raw_probe_items = run_apify_actor(&client, &api_key, "apify~facebook-posts-scraper", raw_probe_input).await.unwrap_or_else(|e| vec![serde_json::json!({ "__probe_error__": e })]);
    let log_path = std::env::temp_dir().join("content-hub-fb-debug.json");
    let combined = serde_json::json!({ "requestedUrl": url, "rawItemCount": raw_probe_items.len(), "rawItems": raw_probe_items, "parsedMetrics": parsed.as_ref().ok(), "parsedError": parsed.as_ref().err(), "debugLogFile": log_path.display().to_string() });
    serde_json::to_string_pretty(&combined).map_err(|e| format!("Failed to serialize debug payload: {}", e))
}

#[tauri::command]
async fn fetch_metrics_with_ai(url: String, api_key: String) -> Result<MetricsResponse, String> {
    if api_key.is_empty() { return Err("API key is empty. Please add your Apify API token in Settings.".to_string()) }
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(120)).build().map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    match detect_platform(&url) {
        "instagram" => fetch_instagram_metrics(&client, &api_key, &url).await,
        "facebook" => fetch_facebook_metrics(&client, &api_key, &url).await,
        "tiktok" => fetch_tiktok_metrics(&client, &api_key, &url).await,
        "youtube" => Err("For YouTube, use the YouTube Data API import in Reports instead. YouTube metrics don't require scraping.".to_string()),
        _ => Err(format!("Unsupported platform. URL must be from Instagram, Facebook, or TikTok. Got: {}", url))
    }
}

#[tauri::command]
async fn fetch_facebook_metrics_via_page_url(target_url: String, page_url: String, api_key: String, known_post_id: Option<String>) -> Result<MetricsResponse, String> {
    if api_key.is_empty() { return Err("API key is empty. Please add your Apify API token in Settings.".to_string()) }
    if page_url.trim().is_empty() { return Err("Workspace Facebook page URL is empty. Set a Facebook page URL on this workspace first (e.g. https://www.facebook.com/YourBrandPage) and try again.".to_string()) }
    if target_url.trim().is_empty() { return Err("Target post/reel URL is empty.".to_string()) }
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(180)).build().map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    let known = known_post_id.as_deref().map(str::trim).filter(|s| !s.is_empty());
    fetch_facebook_metrics_via_page(&client, &api_key, &page_url, &target_url, known).await
}

#[tauri::command]
async fn apify_run_actor(api_key: String, actor_id: String, input: String) -> Result<String, String> {
    if api_key.is_empty() { return Err("No Apify API key configured. Add it in Settings.".to_string()) }
    let input_value: serde_json::Value = serde_json::from_str(&input).map_err(|e| format!("Invalid input JSON: {}", e))?;
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(180)).build().map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    let items = run_apify_actor(&client, &api_key, &actor_id, input_value).await?;
    serde_json::to_string(&items).map_err(|e| format!("Failed to serialize results: {}", e))
}

#[tauri::command]
async fn open_file_or_url(path: String) -> Result<(), String> { open::that(&path).map_err(|e| format!("Failed to open: {}", e)) }

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![fetch_metrics_with_ai, fetch_facebook_metrics_via_page_url, debug_fetch_facebook_post, open_file_or_url, apify_run_actor])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
