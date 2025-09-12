AWS CLI v1

```shell
aws lambda invoke --function-name jobscraper --payload '{"type":"internal"}' /dev/stdout --cli-read-timeout 0
```

AWS CLI v2

```shell
aws lambda invoke --function-name jobscraper --cli-binary-format raw-in-base64-out --payload '{"type":"internal"}' /dev/stdout --cli-read-timeout 0
```
