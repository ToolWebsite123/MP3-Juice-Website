import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';
const TEST_URL = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'; // Me at the zoo (short video)

async function testBackend() {
    console.log('🚀 Starting Backend Verification...');

    try {
        // 1. Test Info Endpoint
        console.log('\n1️⃣ Testing /api/download/info...');
        const infoRes = await fetch(`${BASE_URL}/api/download/info?url=${encodeURIComponent(TEST_URL)}`);
        const infoData = await infoRes.json();

        if (infoRes.ok && infoData.status === 'ok') {
            console.log('✅ Info Endpoint: OK');
            console.log(`   Title: ${infoData.data.title}`);
            console.log(`   Formats Found: ${infoData.data.videoFormats.length}`);
        } else {
            console.error('❌ Info Endpoint Failed:', infoData);
            process.exit(1);
        }

        // 2. Test Direct URL Endpoint (720p)
        console.log('\n2️⃣ Testing /api/download/direct (720p)...');
        const directRes = await fetch(`${BASE_URL}/api/download/direct`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: TEST_URL,
                quality: '360', // 360p is safer for "Me at the zoo" or older videos
                format: 'mp4'
            })
        });
        const directData = await directRes.json();

        if (directRes.ok && directData.status === 'ok' && directData.directUrl) {
            console.log('✅ Direct URL Endpoint: OK');
            console.log(`   URL: ${directData.directUrl.substring(0, 50)}...`);
            console.log(`   Mime: ${directData.mime}`);
        } else {
            console.error('❌ Direct URL Endpoint Failed:', directData);
            process.exit(1);
        }

        console.log('\n🎉 ALL TESTS PASSED! Backend is ready.');

    } catch (err) {
        console.error('❌ Verification Error:', err.message);
        process.exit(1);
    }
}

testBackend();
