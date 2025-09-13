const { JSDOM } = require('jsdom');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const dayjs = require('dayjs');

const CONFIG = require('./config');

async function saveToS3 (stringContent, isInternal = false) {
    // validate
    if (typeof(stringContent) !== 'string') return false;
    
    // trim
    stringContent = stringContent.trim();
    if (!stringContent) return false;

    try {
        let filePath = isInternal ? 'internal/' : '';
        filePath += dayjs().format('YYYYMMDD_HHmmss');
        filePath += '.json';

        const s3Client = new S3Client();

        const command = new PutObjectCommand({
            Bucket: CONFIG.S3_BUCKET,
            Key: 'jobs/' + filePath,
            Body: stringContent,
            ContentType: 'application/json'
        });

        return await s3Client.send(command);
    } catch (e) {
        console.error(e);
    }

    return false;
}

async function getJobs (isString = true) {
    let isSuccess = false;

    try {
        const response = await fetch(CONFIG.ENDPOINT);
        const html = await response.text();
        const data = JSON.parse(html);
        
        // validate json
        if (data !== null) {
            if (isString) {
                const saveResult = await saveToS3(html);
                isSuccess = (saveResult && typeof(saveResult.ETag) == 'string');
            } else {
                console.log(data);
                isSuccess = true;
            }
        }
    } catch (e) {
        console.error(e);
    }

    return {
        statusCode: isSuccess ? 200 : 500,
        body: JSON.stringify({ success: isSuccess })
    };
}

async function getInternalJobDetails (job) {
    if (!job.absolute_url) return;

    const response = await fetch(CONFIG.ENDPOINT_INTERNAL + job.absolute_url, {
        headers: {
            'Cookie': '_session_id=' + CONFIG.SESSION_ID + ';'
        }
    });
    
    const html = await response.text();
    console.log(html);
}

async function getInternalJobs (isString = true) {
    let isSuccess = false;

    try {
        const response = await fetch(CONFIG.ENDPOINT_INTERNAL + CONFIG.INTERNAL_JOB_BOARD_RESOURCE, {
            headers: {
                'Cookie': '_session_id=' + CONFIG.SESSION_ID + ';'
            }
        });
        
        const html = await response.text();
        const dom = new JSDOM(html, { runScripts: 'dangerously' });

        // html js variable
        if (dom.window.__remixContext && dom.window.__remixContext.state.loaderData) {
            const jobsData = dom.window.__remixContext.state.loaderData['routes/internal_job_board'].jobPosts.data;
            
            // @todo
            // append detailed job data
            // jobsData.forEach(getInternalJobDetails);

            if (isString) {
                const saveResult = await saveToS3(JSON.stringify(jobsData), true);
                isSuccess = (saveResult && typeof(saveResult.ETag) == 'string');
            } else {
                console.log(jobsData);
                isSuccess = true;
            }
        }
    } catch (e) {
        console.error(e);
    }

    return {
        statusCode: isSuccess ? 200 : 500,
        body: JSON.stringify({ success: isSuccess })
    };
}

async function start (event, context) {
    let isString = event.isString === false ? false : true;

    switch (event.type) {
        case 'internal':
            return getInternalJobs(isString);
            break;
        default:
            return getJobs(isString);
    }
}

if (process.env.AWS_EXECUTION_ENV) {
    exports.handler = start;
} else {
    let data = JSON.parse(process.argv[2] || '{"type": "internal", "isString": false}');
	start(data);
}
