export async function load({ params, route, url, parent }) {
	//read query parameters
	const query = url.searchParams;
	return {
		error: query.get("error"),
		isSecretSet: process.env.KENER_SECRET_KEY !== undefined,
		isOriginSet: process.env.ORIGIN !== undefined
	};
}