async function run() {
    const res = await fetch('http://localhost:8787/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: 'anyang_admin2',
            password: 'password123',
            email: 'anyang@test.com',
            organization: '안양시 배드민턴 협회'
        })
    });
    const data = await res.json();
    console.log(JSON.stringify(data));
}
run();
