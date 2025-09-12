const { JSDOM } = require('jsdom');
const CONFIG = require('./config');

async function getJobs (isString = true) {
    try {
        const response = await fetch(CONFIG.ENDPOINT);
        const html = await response.text();
        const data = JSON.parse(html);
        
        // validate json
        if (data !== null) {
            if (isString) {
                console.log(html);
            } else {
                console.log(data);
            }
        }
    } catch (e) {
        console.error(e);
    }
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
                console.log(JSON.stringify(jobsData));
            } else {
                console.log(jobsData);
            }
        }
    } catch (e) {
        console.error(e);
    }
}

switch (process.argv[2]) {
    case 'internal':
        getInternalJobs();
        break;
    default:
        getJobs();
}
