const { JSDOM } = require('jsdom');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const dayjs = require('dayjs');
const he = require('he');

const CONFIG = require('./config');
const { inferCompensationRange } = require('./infercompensationrange');

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
            let i = data.jobs.length;
            
            while (i--) {
                // decode html entities
                data.jobs[i].content = he.decode(data.jobs[i].content || '');
                
                // append inferred pay range
                const obj = await inferCompensationRange(data.jobs[i].content);
                data.jobs[i].pay_ranges_inferred = [ obj ];
            }

            if (isString) {
                const saveResult = await saveToS3(JSON.stringify(data), false);
                isSuccess = (saveResult && typeof(saveResult.ETag) == 'string');
            } else {
                console.log(JSON.stringify(data, null, 2));
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

async function getDOM (url) {
    try {
        const response = await fetch(url, {
            headers: {
                'Cookie': '_session_id=' + CONFIG.SESSION_ID + ';'
            }
        });
        
        const html = await response.text();
        return new JSDOM(html, { runScripts: 'dangerously' });
    } catch (e) {
        console.error(e);
    }

    return false;
}

async function getInternalJobDetails (job) {
    if (!job.absolute_url) return false;

    try {
        const dom = await getDOM(CONFIG.ENDPOINT_INTERNAL + job.absolute_url);
    
        if (dom.window.__remixContext && dom.window.__remixContext.state.loaderData) {
            return dom.window.__remixContext.state.loaderData['routes/internal_job_board_.applications_.$job_post_id'].jobPost;
        }
    } catch (e) {
        console.error(e);
    }

    return false;
}

async function getInternalJobs (isString = true) {
    let isSuccess = false;

    try {
        const dom = await getDOM(CONFIG.ENDPOINT_INTERNAL + CONFIG.INTERNAL_JOB_BOARD_RESOURCE);

        // html js variable
        if (dom.window.__remixContext && dom.window.__remixContext.state.loaderData) {
            const jobsData = dom.window.__remixContext.state.loaderData['routes/internal_job_board'].jobPosts.data;
            
            // append details
            let i = jobsData.length;
            
            while (i--) {
                let details = await getInternalJobDetails(jobsData[i]);

                // append inferred pay range
                const obj = await inferCompensationRange(details.content);
                details.pay_ranges_inferred = [ obj ];

                jobsData[i].details = details;
            }

            if (isString) {
                const saveResult = await saveToS3(JSON.stringify(jobsData), true);
                isSuccess = (saveResult && typeof(saveResult.ETag) == 'string');
            } else {
                console.log(JSON.stringify(jobsData, null, 2));
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
    let data = JSON.parse(process.argv[2] || '{"type": "external", "isString": false}');
	start(data);
}
