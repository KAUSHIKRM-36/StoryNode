s = "geeksforgeeks"

i = 0 
j = 0 
ans = 0
	
while j<= len(s)-1 : 
	set1 = set()

	if s[j] not in set1 : 
		set1.add(s[j])
		j+=1
		ans = max(ans,j-i+1)
		answer = s[i:j]
	else:
		while s[i] in set1 :
			set1.remove(s[i])
			print(set1)
			i+=1

print(ans)

print(answer)
