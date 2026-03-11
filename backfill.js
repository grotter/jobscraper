const { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { inferCompensationRange } = require('./infercompensationrange');
const CONFIG = require('./config');

const s3 = new S3Client();

function needsInference(pay_ranges_inferred) {
    return !pay_ranges_inferred || !Array.isArray(pay_ranges_inferred) || pay_ranges_inferred.length === 0;
}

async function backfillFile(key, dryRun) {
    const getResponse = await s3.send(new GetObjectCommand({ Bucket: CONFIG.S3_BUCKET, Key: key }));
    const body = await getResponse.Body.transformToString();
    const data = JSON.parse(body);

    let jobsUpdated = 0;

    // External format: { jobs: [...] }
    if (data && typeof data === 'object' && Array.isArray(data.jobs)) {
        for (const job of data.jobs) {
            if (needsInference(job.pay_ranges_inferred)) {
                console.log(`  inferring: ${job.title}`);
                if (!dryRun) {
                    job.pay_ranges_inferred = [await inferCompensationRange(job.content || '')];
                }
                jobsUpdated++;
            }
        }
    }
    // Internal format: [...]
    else if (Array.isArray(data)) {
        for (const job of data) {
            if (job.details && needsInference(job.details.pay_ranges_inferred)) {
                console.log(`  inferring: ${job.title || job.name}`);
                if (!dryRun) {
                    job.details.pay_ranges_inferred = [await inferCompensationRange(job.details.content || '')];
                }
                jobsUpdated++;
            }
        }
    }

    if (!dryRun && jobsUpdated > 0) {
        await s3.send(new PutObjectCommand({
            Bucket: CONFIG.S3_BUCKET,
            Key: key,
            Body: JSON.stringify(data),
            ContentType: 'application/json',
        }));
        console.log(`  updated ${jobsUpdated} job(s) in ${key}`);
    }

    return jobsUpdated;
}

async function run() {
    const dryRun = process.argv.includes('--dry-run');
    if (dryRun) console.log('dry run — no changes will be written\n');

    let filesChecked = 0;
    let totalJobsUpdated = 0;
    let continuationToken;

    do {
        const listResponse = await s3.send(new ListObjectsV2Command({
            Bucket: CONFIG.S3_BUCKET,
            Prefix: 'jobs/',
            ContinuationToken: continuationToken,
        }));

        for (const obj of (listResponse.Contents || [])) {
            const key = obj.Key;
            if (!key.toLowerCase().endsWith('.json')) continue;

            filesChecked++;
            console.log(`checking ${key}`);

            try {
                totalJobsUpdated += await backfillFile(key, dryRun);
            } catch (e) {
                console.error(`  error processing ${key}:`, e.message);
            }
        }

        continuationToken = listResponse.NextContinuationToken;
    } while (continuationToken);

    const label = dryRun ? 'jobs that would be updated' : 'jobs updated';
    console.log(`\nfiles checked: ${filesChecked}, ${label}: ${totalJobsUpdated}`);
}

run().catch(console.error);
