<script>
	import moment from "moment";
	import * as Accordion from "$lib/components/ui/accordion";
	import { l } from "$lib/i18n/client";
	import { base } from "$app/paths";
	export let incident;
	export let index;
	export let lang;
	let startTime = incident.start_date_time;
	// let startTime = moment(incident.incident_start_time * 1000).format("MMMM Do YYYY, h:mm:ss a");
	let endTime = parseInt(new Date() / 1000);
	let nowTime = parseInt(new Date() / 1000);
	if (incident.end_date_time) {
		endTime = incident.end_date_time;
	}
	let lastedFor = moment.duration(endTime - startTime, "seconds").humanize();
	let startedAt = moment.duration(nowTime - startTime, "seconds").humanize();
	let isFuture = false;
	//is future incident
	if (nowTime < startTime) {
		isFuture = true;
	}
</script>

<div class="newincident relative grid w-full grid-cols-12 gap-2 px-0 py-0 last:border-b-0">
	<div class="col-span-12">
		<Accordion.Root bind:value={index} class="accor">
			<Accordion.Item value="incident-0">
				<Accordion.Trigger class="px-4 hover:bg-muted hover:no-underline">
					<div class="justify-start text-left hover:no-underline">
						<p
							class="scroll-m-20 text-xs font-semibold leading-5 tracking-normal badge-{incident.state}"
						>
							{l(lang, incident.state)}
						</p>
						<p class="scroll-m-20 text-lg font-medium tracking-tight">
							{incident.title}
						</p>

						<p
							class="scroll-m-20 text-sm font-medium tracking-wide text-muted-foreground"
						>
							{#if !isFuture && incident.state != "RESOLVED"}
								<span>
									{l(lang, "Started about %startedAt ago, still ongoing", {
										startedAt
									})}
								</span>
							{:else if !isFuture && incident.state == "RESOLVED"}
								<span>
									{l(
										lang,
										"Started about %startedAt ago, lasted for about %lastedFor",
										{ startedAt, lastedFor }
									)}
								</span>
							{:else if isFuture && incident.state != "RESOLVED"}
								<span>
									{l(lang, "Starts in %startedAt", { startedAt })}
								</span>
							{:else if isFuture && incident.state == "RESOLVED"}
								<span>
									{l(
										lang,
										"Starts in %startedAt, will last for about %lastedFor",
										{ startedAt, lastedFor }
									)}
								</span>
							{/if}
						</p>
					</div>
				</Accordion.Trigger>
				<Accordion.Content>
					<div class="px-4 pt-2">
						{#if incident.monitors.length > 0}
							<div class="flex gap-2">
								{#each incident.monitors as monitor}
									<div
										class="tag-affected-text flex gap-x-2 rounded-md bg-secondary px-1 py-1 pr-2"
									>
										<div
											class="bg-api-{monitor.impact_type.toLowerCase()} rounded px-1.5 py-1 text-xs font-semibold text-primary-foreground"
										>
											{monitor.impact_type}
										</div>
										{#if monitor.image}
											<img src={base + monitor.image} class="mt-1 h-4 w-4" />
										{/if}
										<div class="mt-0.5 font-medium">
											{monitor.name}
										</div>
									</div>
								{/each}
							</div>
						{/if}
						<p class="my-3 text-xs font-semibold uppercase text-muted-foreground">
							Updates
						</p>
						{#if incident.comments.length > 0}
							<ol class="relative mt-2 pl-14">
								{#each incident.comments as comment}
									<li class="relative border-l pb-4 pl-[4.5rem] last:border-0">
										<div
											class="absolute top-0 w-28 -translate-x-32 rounded border bg-secondary px-1.5 py-1 text-center text-xs font-semibold"
										>
											{l(lang, comment.state)}
										</div>
										<time
											class=" mb-1 text-sm font-medium leading-none text-muted-foreground"
										>
											{moment(comment.commented_at * 1000).format(
												"MMMM Do YYYY, h:mm:ss a"
											)}
										</time>

										<p class="mb-4 text-sm font-normal">
											{comment.comment}
										</p>
									</li>
								{/each}
							</ol>
						{:else}
							<p class="text-sm font-medium">
								{l(lang, "No Updates Yet")}
							</p>
						{/if}
					</div>
				</Accordion.Content>
			</Accordion.Item>
		</Accordion.Root>
	</div>
</div>
