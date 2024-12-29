// @ts-nocheck
import {
	GetMinuteStartNowTimestampUTC,
	GetNowTimestampUTC,
	GetMinuteStartTimestampUTC,
	ParseUptime,
	GetDayStartTimestampUTC
} from "./tool.js";
import { GetStartTimeFromBody, GetEndTimeFromBody } from "./github.js";
const API_TOKEN = process.env.API_TOKEN;
const API_IP = process.env.API_IP;
const API_IP_REGEX = process.env.API_IP_REGEX;
import db from "./db/db.js";

import { GetMonitors, VerifyAPIKey } from "./controllers/controller.js";

const GetAllTags = async function () {
	let tags = [];
	let monitors = [];
	try {
		monitors = await GetMonitors({
			status: "ACTIVE"
		});
		tags = monitors.map((monitor) => monitor.tag);
	} catch (err) {
		return [];
	}
	return tags;
};
const CheckIfValidTag = async function (tag) {
	let tags = [];
	try {
		let monitor = await db.getMonitorByTag(tag);
		if (!!!monitor) {
			throw new Error("not a valid tag");
		}
		if (monitor.status != "ACTIVE") {
			throw new Error("monitor is not active");
		}
	} catch (err) {
		return false;
	}
	return true;
};
const auth = async function (request) {
	const authHeader = request.headers.get("authorization");
	const authToken = authHeader?.replace("Bearer ", "");
	// let ip = "";
	// try {
	// 	//ip can be in x-forwarded-for or x-real-ip or remoteAddress
	// 	if (request.headers.get("x-forwarded-for") !== null) {
	// 		ip = request.headers.get("x-forwarded-for").split(",")[0];
	// 	} else if (request.headers.get("x-real-ip") !== null) {
	// 		ip = request.headers.get("x-real-ip");
	// 	} else if (request.connection && request.connection.remoteAddress !== null) {
	// 		ip = request.connection.remoteAddress;
	// 	} else if (request.socket && request.socket.remoteAddress !== null) {
	// 		ip = request.socket.remoteAddress;
	// 	}
	// } catch (err) {
	// 	console.log("IP Not Found " + err.message);
	// }
	if ((await VerifyAPIKey(authToken)) === false) {
		return new Error("invalid token");
	}
	// if (API_IP !== undefined && ip != "") {
	// 	if (API_IP !== ip) {
	// 		return new Error(`invalid ip: ${ip}`);
	// 	}
	// }
	// if (API_IP_REGEX !== undefined && ip != "") {
	// 	const regex = new RegExp(API_IP_REGEX);
	// 	if (!regex.test(ip)) {
	// 		return new Error(`invalid ip regex: ${ip}`);
	// 	}
	// }
	return null;
};
const store = async function (data) {
	const tag = data.tag;
	//remove Bearer from start in authHeader

	const resp = {};
	if (data.status === undefined || ["UP", "DOWN", "DEGRADED"].indexOf(data.status) === -1) {
		return { error: "status missing", status: 400 };
	}
	if (data.latency === undefined || isNaN(data.latency)) {
		return { error: "latency missing or not a number", status: 400 };
	}
	if (data.timestampInSeconds !== undefined && isNaN(data.timestampInSeconds)) {
		return { error: "timestampInSeconds not a number", status: 400 };
	}
	if (data.timestampInSeconds === undefined) {
		data.timestampInSeconds = GetNowTimestampUTC();
	}
	data.timestampInSeconds = GetMinuteStartTimestampUTC(data.timestampInSeconds);
	resp.status = data.status;
	resp.latency = data.latency;
	resp.type = "webhook";
	let timestamp = GetMinuteStartNowTimestampUTC();
	try {
		//throw error if timestamp is future or older than 90days
		if (data.timestampInSeconds > timestamp) {
			throw new Error("timestampInSeconds is in future");
		}
		//past 90 days only
		if (timestamp - data.timestampInSeconds > 90 * 24 * 60 * 60) {
			throw new Error("timestampInSeconds is older than 90days");
		}
	} catch (err) {
		return { error: err.message, status: 400 };
	}
	//check if tag is valid
	let monitor = await db.getMonitorByTag(tag);
	if (!!!monitor) {
		return { error: "no monitor with tag found", status: 400 };
	}
	if (monitor.status != "ACTIVE") {
		return { error: "monitor with the given tag is not active", status: 400 };
	}

	//get the monitor object matching the tag

	await db.insertData({
		monitorTag: tag,
		timestamp: data.timestampInSeconds,
		status: resp.status,
		latency: resp.latency,
		type: "webhook"
	});
	return { status: 200, message: "success at " + data.timestampInSeconds };
};
const GHIssueToKenerIncident = async function (issue) {
	if (!!!issue) {
		return null;
	}

	let issueLabels = issue.labels.map((label) => {
		return label.name;
	});
	let tagsAvailable = await GetAllTags();

	//get common tags as array
	let commonTags = tagsAvailable.filter((tag) => issueLabels.includes(tag));

	let resp = {
		createdAt: Math.floor(new Date(issue.created_at).getTime() / 1000), //in seconds
		closedAt: issue.closed_at ? Math.floor(new Date(issue.closed_at).getTime() / 1000) : null,
		title: issue.title,
		tags: commonTags,
		incidentNumber: issue.number
	};
	resp.startDatetime = GetStartTimeFromBody(issue.body);
	resp.endDatetime = GetEndTimeFromBody(issue.body);

	let body = issue.body;
	body = body.replace(/\[start_datetime:(\d+)\]/g, "");
	body = body.replace(/\[end_datetime:(\d+)\]/g, "");
	resp.body = body.trim();

	resp.impact = null;
	if (issueLabels.includes("incident-down")) {
		resp.impact = "DOWN";
	} else if (issueLabels.includes("incident-degraded")) {
		resp.impact = "DEGRADED";
	}
	resp.isMaintenance = false;
	if (issueLabels.includes("maintenance")) {
		resp.isMaintenance = true;
	}
	resp.isIdentified = false;
	resp.isResolved = false;

	if (issueLabels.includes("identified")) {
		resp.isIdentified = true;
	}
	if (issueLabels.includes("resolved")) {
		resp.isResolved = true;
	}
	return resp;
};
const ParseIncidentPayload = async function (payload) {
	let startDatetime = payload.startDatetime; //in utc seconds optional
	let endDatetime = payload.endDatetime; //in utc seconds optional
	let title = payload.title; //string required
	let body = payload.body || ""; //string optional
	let tags = payload.tags; //string and required
	let impact = payload.impact; //string and optional
	let isMaintenance = payload.isMaintenance; //boolean and optional
	let isIdentified = payload.isIdentified; //string and optional and if present can be resolved or identified
	let isResolved = payload.isResolved; //string and optional and if present can be resolved or identified

	// Perform validations

	if (startDatetime && typeof startDatetime !== "number") {
		return { error: "Invalid startDatetime" };
	}
	if (endDatetime && (typeof endDatetime !== "number" || endDatetime <= startDatetime)) {
		return { error: "Invalid endDatetime" };
	}

	if (!title || typeof title !== "string") {
		return { error: "Invalid title" };
	}
	//tags should be an array of string with atleast one element
	if (
		!tags ||
		!Array.isArray(tags) ||
		tags.length === 0 ||
		tags.some((tag) => typeof tag !== "string")
	) {
		return { error: "Invalid tags" };
	}

	// Optional validation for body and impact
	if (body && typeof body !== "string") {
		return { error: "Invalid body" };
	}

	if (impact && (typeof impact !== "string" || ["DOWN", "DEGRADED"].indexOf(impact) === -1)) {
		return { error: "Invalid impact" };
	}
	//check if tags are valid
	const allTags = await GetAllTags();
	if (tags.some((tag) => allTags.indexOf(tag) === -1)) {
		return { error: "Unknown tags" };
	}
	// Optional validation for isMaintenance
	if (isMaintenance && typeof isMaintenance !== "boolean") {
		return { error: "Invalid isMaintenance" };
	}

	let githubLabels = ["incident"];
	tags.forEach((tag) => {
		githubLabels.push(tag);
	});
	if (impact) {
		githubLabels.push("incident-" + impact.toLowerCase());
	}
	if (isMaintenance) {
		githubLabels.push("maintenance");
	}
	if (isResolved !== undefined && isResolved === true) {
		githubLabels.push("resolved");
	}
	if (isIdentified !== undefined && isIdentified === true) {
		githubLabels.push("identified");
	}

	if (startDatetime) body = body + " " + `[start_datetime:${startDatetime}]`;
	if (endDatetime) body = body + " " + `[end_datetime:${endDatetime}]`;

	return { title, body, githubLabels };
};
const GetMonitorStatusByTag = async function (tag, timestamp) {
	let monitor = await db.getMonitorByTag(tag);
	if (!!!monitor) {
		return { error: "no monitor with tag found", status: 400 };
	}
	if (monitor.status != "ACTIVE") {
		return { error: "monitor with the given tag is not active", status: 400 };
	}
	const resp = {
		status: null,
		uptime: null,
		lastUpdatedAt: null
	};

	const { includeDegradedInDowntime } = monitor;

	let now = GetMinuteStartNowTimestampUTC();
	if (timestamp !== null && timestamp !== undefined) {
		now = timestamp;
	}
	let start = GetDayStartTimestampUTC(now);

	let dayDataNew = await db.getData(tag, start, now);
	let ups = 0;
	let downs = 0;
	let degradeds = 0;
	let lastData = dayDataNew[dayDataNew.length - 1];

	for (let i = 0; i < dayDataNew.length; i++) {
		let row = dayDataNew[i];
		if (row.status == "UP") {
			ups++;
		} else if (row.status == "DEGRADED") {
			degradeds++;
		} else if (row.status == "DOWN") {
			downs++;
		}
	}
	let numerator = ups + degradeds;
	if (includeDegradedInDowntime === "YES") {
		numerator = ups;
	}

	resp.uptime = ParseUptime(numerator, ups + degradeds + downs);
	resp.lastUpdatedAt = Number(lastData.timestamp);
	resp.status = lastData.status;
	return { status: 200, ...resp };
};
export {
	store,
	auth,
	CheckIfValidTag,
	GHIssueToKenerIncident,
	ParseIncidentPayload,
	GetAllTags,
	GetMonitorStatusByTag
};
