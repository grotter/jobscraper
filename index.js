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

        const response = await s3Client.send(command);
    } catch (e) {
        console.error(e);

        return {
            statusCode: 500,
            body: JSON.stringify(e)
        };
    }

    return {
        statusCode: 200,
        body: JSON.stringify({ success: true })
    };
}

async function getJobs (isString = true) {
    try {
        const response = await fetch(CONFIG.ENDPOINT);
        const html = await response.text();
        const data = JSON.parse(html);
        
        // validate json
        if (data !== null) {
            if (isString) {
                saveToS3(html);
            } else {
                console.log(data);
            }
        }
    } catch (e) {
        console.error(e);

        return {
            statusCode: 500,
            body: JSON.stringify(e)
        };
    }

    return {
        statusCode: 200,
        body: JSON.stringify({ success: true })
    };
}

async function getInternalJobs (isString = true) {
    try {
        const response = await fetch(CONFIG.ENDPOINT_INTERNAL, {
            headers: {
                'Cookie': '_session_id=' + CONFIG.SESSION_ID + ';'
            }
        });
        
        const html = await response.text();
        const dom = new JSDOM(html, { runScripts: 'dangerously' });

        // html js variable
        if (dom.window.__remixContext && dom.window.__remixContext.state.loaderData) {
            const jobsData = dom.window.__remixContext.state.loaderData['routes/internal_job_board'].jobPosts.data;
            
            if (isString) {
                saveToS3(JSON.stringify(jobsData), true);
            } else {
                console.log(jobsData);
            }
        }
    } catch (e) {
        console.error(e);

        return {
            statusCode: 500,
            body: JSON.stringify(e)
        };
    }

    return {
        statusCode: 200,
        body: JSON.stringify({ success: true })
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
    let data = JSON.parse(process.argv[2] || '{}');
	start(data);
}
